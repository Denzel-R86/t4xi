/** Local PostgreSQL integration test; no linked Supabase project or network access. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { createWhatsAppIngress, type IngressReceipt, type IngressStore } from "@/lib/whatsapp/ingress";

async function main() {
const exec = promisify(execFile);
const container = "t4xi-whatsapp-ingress-test";
const database = `whatsapp_ingress_test_${process.pid}`;
const inspect = JSON.parse((await exec("docker", ["inspect", container])).stdout)[0];
assert.equal(inspect.HostConfig.NetworkMode, "none", "test container must have no network");
const sql = async (query: string, db = database) => {
  const { stdout } = await exec("docker", ["exec", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", query], { maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim();
};
const literal = (value: string) => "'" + value.replace(/'/g, "''") + "'";
await sql(`create database ${database}`, "postgres");
try {
  // Minimal pre-existing booking relation, not a claim of a full Supabase schema rebuild.
  await sql(`
    do $$ begin
      if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create table public.bookings(id uuid primary key);
    create table public.pricing_quote_logs(id integer);
    create table public.customers(id integer);
    insert into public.bookings values ('11111111-1111-4111-8111-111111111111');
    insert into public.pricing_quote_logs values(1);
    insert into public.customers values(1);
    create function public.forbid_domain_write() returns trigger language plpgsql as $$
    begin raise exception 'INGRESS_DOMAIN_WRITE'; end $$;
    create trigger protect_booking before insert or update or delete on public.bookings for each statement execute function public.forbid_domain_write();
    create trigger protect_pricing before insert or update or delete on public.pricing_quote_logs for each statement execute function public.forbid_domain_write();
    create trigger protect_customer before insert or update or delete on public.customers for each statement execute function public.forbid_domain_write();
    -- Simulate Supabase default grants: the migration must explicitly remove them.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  await sql(readFileSync("supabase/migrations/20260909114512_whatsapp_ingress.sql", "utf8"));
  await sql(readFileSync("supabase/tests/whatsapp_ingress.sql", "utf8"));
  console.log("PASS SQL: role enforcement, RLS/grants, duplicate IDs, audit-only events, rollback, handoff/draft isolation and content purge");

  const receipts: IngressReceipt[] = [];
  const store: IngressStore = { async receive(scope, events) {
    const result = JSON.parse(await sql(`set role service_role; select public.receive_whatsapp_events(${literal(scope.wabaId)}, ${literal(scope.phoneNumberId)}, ${literal(JSON.stringify(events))}::jsonb)`));
    receipts.push(result);
    return result;
  } };
  const config = { wabaId: "100", phoneNumberId: "200", appSecret: "local-only-test", verifyToken: "test", fingerprintSecret: "test-audit" };
  const handler = createWhatsAppIngress({ config: () => config, store: () => store, audit() {} });
  function request(ids: string[], sender = "31612345678") {
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "100", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { phone_number_id: "200" },
      messages: ids.map(id => ({ id, from: sender, timestamp: "1788955200", type: "text", text: { body: "Test only 🚕" } })),
    } }] }] });
    return new Request("https://test.invalid/api/webhooks/whatsapp", { method: "POST", body: raw,
      headers: { "x-hub-signature-256": "sha256=" + createHmac("sha256", config.appSecret).update(raw).digest("hex") } });
  }
  const responses = await Promise.all(Array.from({ length: 20 }, () => handler.POST(request(["wamid.concurrent"]))));
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(receipts.reduce((sum, value) => sum + value.stored, 0), 1);
  assert.equal(receipts.reduce((sum, value) => sum + value.duplicates, 0), 19);
  assert.equal(await sql("select count(*) from public.whatsapp_messages"), "1");
  assert.equal(await sql("select count(*) from public.whatsapp_conversations"), "1");
  assert.equal(await sql("select count(*) from public.whatsapp_event_log"), "1");
  console.log("PASS concurrency: 20 signed HTTP requests -> 1 message, 1 conversation, 1 audit row, 19 duplicates");

  const overlapping = await Promise.all([
    handler.POST(request(["wamid.batch.a", "wamid.batch.b"])),
    handler.POST(request(["wamid.batch.b", "wamid.batch.a"])),
  ]);
  assert.ok(overlapping.every(response => response.status === 200));
  assert.equal(await sql("select count(*) from public.whatsapp_messages"), "3");
  assert.equal(await sql("select count(*) from public.whatsapp_conversations"), "1");
  console.log("PASS overlapping reverse-order batches: two additional IDs, no deadlock or duplicates");

  // Simulate a lost HTTP/database reply AFTER a successful commit; retry must be harmless.
  const uncertain = createWhatsAppIngress({ config: () => config, audit() {}, store: () => ({ async receive(scope, events) {
    await store.receive(scope, events);
    throw new Error("response lost after commit");
  } }) });
  assert.equal((await uncertain.POST(request(["wamid.lost-reply"]))).status, 503);
  assert.equal((await handler.POST(request(["wamid.lost-reply"]))).status, 200);
  assert.equal(await sql("select count(*) from public.whatsapp_messages"), "4");
  console.log("PASS committed-but-lost response: retry acknowledges the original stored message");
  assert.equal(await sql("select count(*) from public.bookings"), "1");
  assert.equal(await sql("select count(*) from public.pricing_quote_logs"), "1");
  assert.equal(await sql("select count(*) from public.customers"), "1");
  assert.equal(await sql("select count(*) from public.whatsapp_conversations where booking_draft <> '{}'::jsonb or linked_booking_id is not null or state <> 'active'"), "0");
  console.log("PASS domain isolation: booking/pricing/customer write traps never fired; drafts and booking links untouched");
} finally {
  await sql(`drop database ${database} with (force)`, "postgres");
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
