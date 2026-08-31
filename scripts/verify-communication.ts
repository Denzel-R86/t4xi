/**
 * Read-only controle op de communication engine en de booking-lifecycle.
 *
 * Bedoeld voor stap 6 (smoke test op staging) en stap 8 (controleren na
 * uitrol). Schrijft NIETS: geen migratie, geen statusovergang, geen mail. Wie
 * dit script draait kan er niets mee kapotmaken.
 *
 * Gebruik:
 *   npx tsx scripts/verify-communication.ts
 *   npx tsx scripts/verify-communication.ts --env=.env.staging.local
 *   npx tsx scripts/verify-communication.ts --trace=T4XI-2026-0007
 *
 * `--trace` volgt één boeking door de hele keten — statusovergang → auditregel →
 * domeinevent → delivery claim → provider-message-id → webhookstatus — omdat
 * groene aggregaten nog geen bewijs zijn dat de architectuur doet wat hij belooft.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_STATUSES, STATUS_EVENT, isBookingStatus } from "@/lib/bookings/lifecycle";
import { communicationSchemaReady } from "@/lib/config/environment";

// ── kleine .env-loader (geen dependency) ─────────────────────────────────────
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

const envFlag = process.argv.slice(2).find((arg) => arg.startsWith("--env="));
if (envFlag) loadEnvFile(resolve(process.cwd(), envFlag.slice("--env=".length)));
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const OK = "  ok  ";
const WARN = " let op";
const FAIL = " fout ";

function line(mark: string, text: string): void {
  console.log(`[${mark}] ${text}`);
}

type Counts = Record<string, number>;

function tally(rows: Array<Record<string, unknown>>, column: string): Counts {
  const counts: Counts = {};
  for (const row of rows) {
    const key = String(row[column] ?? "onbekend");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function render(counts: Counts): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([key, n]) => `${key}=${n}`).join("  ") : "geen";
}

/** Bestaat de tabel/RPC al? Onderscheidt "migratie niet toegepast" van een echte fout. */
function missing(error: { code?: string | null; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  return (
    code === "PGRST202" ||
    code === "42883" ||
    code === "42P01" ||
    /could not find|does not exist/i.test(error.message ?? "")
  );
}

async function checkLifecycle(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.from("bookings").select("status");
  if (error) {
    line(FAIL, `boekingen niet leesbaar: ${error.message}`);
    return false;
  }
  const counts = tally(data ?? [], "status");
  const strays = Object.keys(counts).filter(
    (status) => !(BOOKING_STATUSES as readonly string[]).includes(status)
  );
  line(strays.length ? FAIL : OK, `lifecycle-standen: ${render(counts)}`);
  if (strays.length) {
    line(FAIL, `onbekende standen: ${strays.join(", ")} — migratie nog niet toegepast of data afgeweken`);
  }
  return strays.length === 0;
}

async function checkTransitions(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from("booking_status_transitions")
    .select("from_status, to_status, actor, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (missing(error)) {
    line(WARN, "audittabel bestaat nog niet — migratie niet toegepast");
    return;
  }
  if (error) {
    line(FAIL, `audittrail niet leesbaar: ${error.message}`);
    return;
  }
  const rows = data ?? [];
  line(rows.length ? OK : WARN, `lifecycle-audit: ${rows.length} recente overgangen`);
  for (const row of rows.slice(0, 5)) {
    const r = row as Record<string, unknown>;
    line(OK, `  ${r.created_at} ${r.from_status} → ${r.to_status} (${r.actor})`);
  }
  if (!rows.length) {
    line(WARN, "  nog geen enkele overgang: de lifecycle is nog niet in productie bewezen");
  }
}

async function checkDeliveries(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from("communication_deliveries")
    .select("status, channel, event_type, provider_message_id, attempts, last_error, skip_reason")
    .order("queued_at", { ascending: false })
    .limit(500);
  if (missing(error)) {
    line(WARN, "communicatielog bestaat nog niet — migratie niet toegepast");
    return;
  }
  if (error) {
    line(FAIL, `communicatielog niet leesbaar: ${error.message}`);
    return;
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  line(OK, `afleveringen: ${render(tally(rows, "status"))}`);
  line(OK, `kanalen: ${render(tally(rows, "channel"))}`);
  line(OK, `events: ${render(tally(rows, "event_type"))}`);

  const failed = rows.filter((row) => row.status === "failed");
  line(failed.length ? FAIL : OK, `mislukte verzendingen: ${failed.length}`);
  for (const row of failed.slice(0, 5)) line(FAIL, `  ${row.event_type}: ${row.last_error}`);

  const bad = rows.filter((row) => row.status === "bounced" || row.status === "complained");
  line(bad.length ? WARN : OK, `bounces en klachten: ${bad.length}`);

  // Zonder message-id kan de webhook deze regel nooit bijwerken.
  const blind = rows.filter((row) => row.status === "sent" && !row.provider_message_id);
  line(blind.length ? WARN : OK, `verzonden zonder provider-message-id: ${blind.length}`);

  // Blijft alles op 'sent' staan, dan komt de webhook niet binnen.
  const sent = rows.filter((row) => row.status === "sent").length;
  const settled = rows.filter((row) => row.status === "delivered").length;
  if (sent > 0 && settled === 0) {
    line(WARN, "geen enkele 'delivered' — de Resend-webhook is waarschijnlijk niet geregistreerd");
  }

  const retried = rows.filter((row) => Number(row.attempts ?? 0) > 1);
  line(OK, `regels met meer dan één poging: ${retried.length}`);
}

async function checkStore(supabase: SupabaseClient): Promise<void> {
  // Probeert de RPC met een sleutel die niet bestaat; claimt dus nooit iets echt,
  // maar laat wél zien of de functie aanwezig en aanroepbaar is.
  const { error } = await supabase.rpc("record_communication_provider_event", {
    p_provider_message_id: "verify-communication-probe-does-not-exist",
    p_status: "delivered",
  });
  const ready = communicationSchemaReady();

  if (missing(error)) {
    if (ready) {
      line(FAIL, "COMMUNICATION_SCHEMA_READY staat aan maar de RPC ontbreekt — schema-regressie, verzending wordt geblokkeerd");
    } else {
      line(WARN, "idempotency-store nog niet geïnstalleerd — communicatie loopt zonder dedup en zonder log");
    }
    return;
  }
  if (error) {
    line(FAIL, `idempotency-store onbereikbaar: ${error.message}`);
    return;
  }

  line(OK, "idempotency-store aanwezig en aanroepbaar");
  // De vlag en de werkelijkheid moeten na de uitrol samenvallen.
  line(
    ready ? OK : WARN,
    ready
      ? "COMMUNICATION_SCHEMA_READY=true — een ontbrekende RPC geldt terecht als regressie"
      : "COMMUNICATION_SCHEMA_READY staat nog uit terwijl het schema er wél is — zet aan, anders wordt een latere regressie gelezen als 'migratie ontbreekt'"
  );
}

/**
 * Volgt één boeking door de volledige keten. Read-only.
 *
 * Let op de derde schakel: een domeinevent laat alleen een spoor na wanneer er
 * een template aan hangt. Lifecycle-events hebben die (nog) niet, dus daar
 * stopt het bewijs bij de auditregel. Dat is de huidige ontwerpgrens, geen fout.
 */
async function traceBooking(supabase: SupabaseClient, needle: string): Promise<void> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, booking_ref, status, payment_status, email_sent, created_at")
    .eq(isUuid ? "id" : "booking_ref", needle)
    .maybeSingle<{
      id: string;
      booking_ref: string;
      status: string;
      payment_status: string;
      email_sent: boolean;
      created_at: string;
    }>();

  if (error) {
    line(FAIL, `boeking niet opvraagbaar: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (!booking) {
    line(FAIL, `geen boeking gevonden voor "${needle}"`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n1. Boeking`);
  line(
    isBookingStatus(booking.status) ? OK : FAIL,
    `${booking.booking_ref} — status=${booking.status} payment=${booking.payment_status} email_sent=${booking.email_sent}`
  );

  console.log(`\n2. Statusovergangen (audit)`);
  const { data: audit, error: auditError } = await supabase
    .from("booking_status_transitions")
    .select("from_status, to_status, actor, reason, created_at")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: true });
  if (auditError) {
    line(missing(auditError) ? WARN : FAIL, `audittrail: ${auditError.message}`);
  } else if (!audit?.length) {
    line(WARN, "geen overgangen — deze boeking heeft de lifecycle nog niet doorlopen");
  } else {
    for (const row of audit as Array<Record<string, unknown>>) {
      line(OK, `${row.created_at} ${row.from_status} → ${row.to_status} (${row.actor})`);
    }
  }

  console.log(`\n3. Verwachte domeinevents`);
  const expected = new Set<string>(["booking.created"]);
  for (const row of (audit ?? []) as Array<Record<string, unknown>>) {
    const to = String(row.to_status);
    const event = isBookingStatus(to) ? STATUS_EVENT[to] : null;
    if (event) expected.add(event);
  }
  line(OK, [...expected].join("  "));

  console.log(`\n4. Delivery claims`);
  const { data: deliveries, error: deliveryError } = await supabase
    .from("communication_deliveries")
    .select("dedup_key, event_type, template_id, audience, channel, status, provider, provider_message_id, attempts, last_error, skip_reason, queued_at, sent_at, settled_at")
    .eq("booking_id", booking.id)
    .order("queued_at", { ascending: true });
  if (deliveryError) {
    line(missing(deliveryError) ? WARN : FAIL, `communicatielog: ${deliveryError.message}`);
    return;
  }

  const rows = (deliveries ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) {
    line(FAIL, "geen enkele delivery — de keten is hier gebroken");
    process.exitCode = 1;
    return;
  }
  for (const row of rows) {
    const mark = row.status === "failed" || row.status === "bounced" ? FAIL : OK;
    line(mark, `${row.dedup_key}`);
    line(mark, `    template=${row.template_id} status=${row.status} pogingen=${row.attempts}`);
    if (row.last_error) line(FAIL, `    fout: ${row.last_error}`);
    if (row.skip_reason) line(WARN, `    overgeslagen: ${row.skip_reason}`);
  }

  console.log(`\n5. Provider-message-id`);
  const sent = rows.filter((row) => row.status !== "skipped");
  const withId = sent.filter((row) => Boolean(row.provider_message_id));
  line(
    withId.length === sent.length ? OK : FAIL,
    `${withId.length} van ${sent.length} verzendingen heeft een message-id`
  );
  for (const row of withId) line(OK, `    ${row.template_id} → ${row.provider_message_id}`);
  if (withId.length < sent.length) {
    line(FAIL, "    zonder message-id kan de webhook deze regels nooit bijwerken");
  }

  console.log(`\n6. Webhookstatus`);
  const settled = rows.filter((row) =>
    ["delivered", "bounced", "complained"].includes(String(row.status))
  );
  if (!settled.length) {
    line(
      WARN,
      "nog geen enkele providerstatus — de webhook komt niet binnen, of de aflevering loopt nog"
    );
  } else {
    for (const row of settled) line(OK, `    ${row.template_id} → ${row.status} (${row.settled_at})`);
  }

  const eventsSeen = new Set(rows.map((row) => String(row.event_type)));
  const zonderSpoor = [...expected].filter((event) => !eventsSeen.has(event));
  console.log(`\nKetenoordeel`);
  if (zonderSpoor.length) {
    // Lifecycle-events hebben nog geen template en laten daarom bewust geen
    // logregel na. Het bewijs stopt daar bij de auditregel.
    line(WARN, `zonder logspoor (geen template): ${zonderSpoor.join(", ")}`);
  }
  const gebroken =
    rows.some((row) => row.status === "failed") || withId.length < sent.length;
  line(
    gebroken ? FAIL : OK,
    gebroken
      ? "de keten is ergens gebroken — zie hierboven"
      : "statusovergang → audit → delivery → message-id" +
        (settled.length ? " → webhookstatus: sluitend" : " (webhookstatus nog open)")
  );
  if (gebroken) process.exitCode = 1;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn vereist (of geef --env=<bestand>)."
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const traceFlag = process.argv.slice(2).find((arg) => arg.startsWith("--trace="));
  if (traceFlag) {
    const needle = traceFlag.slice("--trace=".length).trim();
    console.log(`\nKetentrace voor ${needle} op ${new URL(url).host}`);
    await traceBooking(supabase, needle);
    console.log("");
    return;
  }

  console.log(`\nCommunication engine — controle op ${new URL(url).host}\n`);
  const lifecycleOk = await checkLifecycle(supabase);
  await checkTransitions(supabase);
  await checkStore(supabase);
  await checkDeliveries(supabase);

  console.log(
    `\n${lifecycleOk ? "Lifecycle-woordenlijst klopt." : "Lifecycle-woordenlijst klopt NIET — zie hierboven."}\n`
  );
  if (!lifecycleOk) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
