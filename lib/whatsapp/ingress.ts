import { createHash, timingSafeEqual } from "node:crypto";
import { normalizeWhatsAppEvents, type IngressEvent, type IngressScope } from "@/lib/whatsapp/events";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/webhook-signature";

export const MAX_WEBHOOK_BYTES = 128 * 1024;
export type IngressConfig = IngressScope & { appSecret: string; verifyToken: string; fingerprintSecret: string };
export type IngressReceipt = { received: number; stored: number; ignored: number; rejected: number; duplicates: number };
export type IngressStore = { receive(scope: IngressScope, events: IngressEvent[]): Promise<IngressReceipt> };
export type IngressAudit = (result: string, counts?: IngressReceipt) => void;
export type IngressDependencies = {
  config(): IngressConfig | null;
  store(): IngressStore | null;
  audit: IngressAudit;
};
export function ingressConfig(env: Record<string, string | undefined>): IngressConfig | null {
  if (env.WHATSAPP_INGRESS_ENABLED !== "true") return null;
  const appSecret = env.WHATSAPP_APP_SECRET;
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN;
  const fingerprintSecret = env.WHATSAPP_FINGERPRINT_SECRET;
  const wabaId = env.WHATSAPP_WABA_ID;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  if (!appSecret?.trim() || !verifyToken?.trim() || !fingerprintSecret?.trim() || !wabaId || !phoneNumberId) return null;
  if (!/^[0-9]{1,32}$/.test(wabaId) || !/^[0-9]{1,32}$/.test(phoneNumberId)) return null;
  return { appSecret, verifyToken, fingerprintSecret, wabaId, phoneNumberId };
}
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const json = (status: number, error?: string) => Response.json(error ? { ok: false, error } : { ok: true }, { status, headers });
class BodyTooLarge extends Error {}
async function readBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_WEBHOOK_BYTES) throw new BodyTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        throw new BodyTooLarge();
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
}

/** Ingress only: a successful ACK means the entire normalized batch is committed. */
export function createWhatsAppIngress(deps: IngressDependencies) {
  return {
    async GET(request: Request): Promise<Response> {
      const config = deps.config();
      if (!config) return json(503, "not_configured");
      const params = new URL(request.url).searchParams;
      const mode = params.get("hub.mode");
      const token = params.get("hub.verify_token");
      const challenge = params.get("hub.challenge");
      const digest = (value: string) => createHash("sha256").update(value).digest();
      if (["hub.mode", "hub.verify_token", "hub.challenge"].some(key => params.getAll(key).length !== 1)
        || mode !== "subscribe" || !token || !challenge || challenge.length > 256
        || !timingSafeEqual(digest(token), digest(config.verifyToken))) {
        deps.audit("verification_rejected");
        return json(403, "verification_failed");
      }
      deps.audit("verification_accepted");
      return new Response(challenge, { status: 200, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
    },
    async POST(request: Request): Promise<Response> {
      const config = deps.config();
      if (!config) return json(503, "not_configured");
      let body: Uint8Array;
      try { body = await readBody(request); }
      catch (error) {
        const tooLarge = error instanceof BodyTooLarge;
        deps.audit(tooLarge ? "payload_too_large" : "read_failed");
        return json(tooLarge ? 413 : 400, tooLarge ? "payload_too_large" : "invalid_body");
      }
      const verification = verifyWhatsAppSignature({ appSecret: config.appSecret, signature: request.headers.get("x-hub-signature-256"), body });
      if (!verification.ok) {
        deps.audit("signature_rejected");
        return json(401, "invalid_signature");
      }
      let events: IngressEvent[];
      try {
        // Fatal UTF-8 decoding prevents replacement characters from altering stored content.
        const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
        events = normalizeWhatsAppEvents(payload, config, config.fingerprintSecret);
      } catch {
        deps.audit("payload_rejected");
        return json(400, "invalid_payload");
      }
      try {
        const store = deps.store();
        if (!store) throw new Error("unavailable");
        const receipt = await store.receive(config, events);
        deps.audit("committed", receipt);
        return json(200);
      } catch {
        // No payloads, numbers, signatures, provider error messages or secrets in logs.
        deps.audit("storage_unavailable");
        return json(503, "storage_unavailable");
      }
    },
  };
}
