import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { Session } from './whatsapp-test/session';

// Real canonical booking SQL; SDK transport, pricing and communications are
// isolated test boundaries. This proves the status contract, not Gate 3 pricing.
const container = 't4xi-whatsapp-gate3-status';
const database = `status_${process.pid}`;
const lit = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const value = (v: unknown) => v == null ? 'null' : typeof v === 'number' ? String(v) : lit(String(v));
const req = createRequire(import.meta.url);
async function main() {
  assert.equal(JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0].HostConfig.NetworkMode, 'none');
  const boot = new Session('postgres', container);
  await boot.query(`create database ${database};`); boot.close();
  const sql = new Session(database, container);
  try {
    await sql.query("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; create role authenticated; create role service_role bypassrls; end if; end $$;");
    const migrations = [
      '20260707120000_bookings_schema_baseline.sql',
      '20260720020000_add_flight_number_to_bookings.sql',
      '20260720090000_add_flight_direction_to_bookings.sql',
      '20260808103643_harden_search_path_booking_fns.sql',
      '20260830120000_booking_lifecycle_and_communication.sql',
    ];
    for (const m of migrations) await sql.query(readFileSync('supabase/migrations/' + m, 'utf8'));
    let statusFailure = false;
    let transitionBeforeRead = false;
    const calls: unknown[] = [];
    const db = {
      async rpc(name: string, args: Record<string, unknown>) {
        assert.equal(name, 'create_booking'); calls.push({ rpc: name, args });
        const data = JSON.parse(await sql.query(`select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.${name}(${Object.entries(args).map(([k,v])=>k+'=>'+value(v)).join(',')}) r;`));
        return { data, error: null };
      },
      from(table: string) {
        assert.equal(table, 'bookings');
        return { select(columns: string) { assert.equal(columns, 'status'); return { eq(column: string, id: string) {
          assert.equal(column, 'id'); return { async single() {
            calls.push({ statusRead: id });
            if (statusFailure) return { data: null, error: { message: 'injected unavailable read after commit' } };
            if (transitionBeforeRead) await sql.query(`select public.transition_booking_status(${lit(id)},'confirmed','status-test','before response');`);
            return { data: JSON.parse(await sql.query(`select jsonb_build_object('status',status) from public.bookings where id=${lit(id)};`)), error: null };
          } };
        } }; } };
      },
    };
    const deps: Record<string, unknown> = {
      '@supabase/supabase-js': { createClient: () => db },
      'next/server': { NextResponse: { json: (payload: unknown, init: ResponseInit) => Response.json(payload, init) } },
      '@/lib/pricing/engine': { resolveBookingPrice: async () => ({ kind: 'on_request', airport: { isAirportTransfer: false, isAirportPickup: false, isAirportDropoff: false, pickupIsAirport: false, dropoffIsAirport: false, flightDirection: null } }) },
      '@/lib/communication/orchestrator': { dispatch: async () => { calls.push({ communicationBoundary: 'suppressed' }); return { delivered: false }; } },
      '@/lib/communication/delivery-log': { supabaseDeliveryLog: () => ({}) },
      '@/lib/flight-monitoring/service': { buildTripMonitoringRegistration: () => null, registerFlightMonitoring: async () => {} },
      '@/lib/security/rate-limit': { clientIp: () => '192.0.2.10', rateLimit: () => ({ limited: false }) },
    };
    function evaluate(path: string) {
      const exports: Record<string, (v: never) => Promise<never>> = {};
      const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      runInNewContext(source, { exports, require: (id: string) => id in deps ? deps[id] : id.startsWith('@/lib/') ? req('../' + id.slice(2) + '.ts') : (() => { throw new Error('Unapproved dependency '+id); })(), Buffer, Date, console, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' } } });
      return exports;
    }
    const service = evaluate('lib/bookings/create.ts'); deps['@/lib/bookings/create'] = service;
    const route = evaluate('app/api/bookings/route.ts');
    const body = { pickup: 'Amsterdam Centrum', dropoff: 'Utrecht Centrum', date: '2099-10-10', time: '09:00', customerName: 'Status Test', customerEmail: 'status@example.invalid', customerPhone: '+31600000001', persons: 2, luggage: 'handbagage', rideType: 'enkel' };
    const evidence: unknown[] = [];
    for (const scenario of ['service inquiry', 'API inquiry', 'service current confirmed', 'API unknown after commit']) {
      statusFailure = scenario.includes('unknown'); transitionBeforeRead = scenario.includes('confirmed');
      const before = Number(await sql.query('select count(*) from public.bookings;'));
      const result = scenario.startsWith('API')
        ? await (async () => { const response = await route.POST(new Request('https://test.invalid/api/bookings', { method: 'POST', body: JSON.stringify(body) }) as never) as Response; return { status: response.status, payload: await response.json() }; })()
        : await service.createBooking(body as never) as { status: number; payload: Record<string, unknown> };
      const rows = JSON.parse(await sql.query('select jsonb_agg(to_jsonb(b) order by created_at) from public.bookings b;'));
      assert.equal(rows.length, before + 1);
      const row = rows.find((r: { id: string }) => r.id === result.payload.bookingId);
      assert.ok(row);
      if (statusFailure) { assert.equal(result.status, 503); assert.equal(result.payload.error, 'booking_outcome_unknown'); assert.equal(result.payload.status, undefined); assert.equal(row.status, 'inquiry'); }
      else { assert.equal(result.status, 201); assert.equal(row.status, transitionBeforeRead ? 'confirmed' : 'inquiry'); assert.equal(result.payload.status, row.status); }
      const audit = JSON.parse(await sql.query("select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.booking_status_transitions a;"));
      assert.equal(Number(await sql.query('select count(*) from public.communication_deliveries;')), 0);
      evidence.push({ scenario, beforeCount: before, result, booking: row, afterCount: rows.length, audit, communicationRows: 0, outcome: 'PASS' });
      console.log('PASS '+scenario);
    }
    const final = JSON.parse(await sql.query("select jsonb_build_object('bookings',(select jsonb_agg(to_jsonb(b) order by created_at) from public.bookings b),'transitions',(select jsonb_agg(to_jsonb(a)) from public.booking_status_transitions a),'communications',(select count(*) from public.communication_deliveries));"));
    assert.equal(final.bookings.length, 4); assert.equal(final.transitions.length, 1);
    mkdirSync('work/gate3', { recursive: true });
    writeFileSync('work/gate3/status-postgres-evidence.json', JSON.stringify({ database, migrations, server: await sql.query('select version();'), mocks: ['Supabase SDK transport bridged to real PostgreSQL', 'pricing on_request boundary', 'communication suppressed at dispatcher', 'flight registration suppressed', 'HTTP rate limiter'], evidence, final, calls }, null, 2));
  } finally { sql.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
