import { createWhatsAppIngress, ingressConfig } from "@/lib/whatsapp/ingress";
import { configuredIngressStore } from "@/lib/whatsapp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ingress = createWhatsAppIngress({
  config: () => ingressConfig(process.env),
  store: configuredIngressStore,
  audit: (result, counts) => console.info("[whatsapp-ingress]", { result, ...counts }),
});
export const GET = ingress.GET;
export const POST = ingress.POST;
