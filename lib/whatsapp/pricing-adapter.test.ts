import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { calculateBookingPrice } from '@/lib/pricing/engine';
import { resolveQuoteWith, type ResolveQuoteDeps } from '@/lib/pricing/service';
import { neutralPickupApproachDeps, wrapGetRouteWithNeutralApproach } from '@/lib/pricing/pickup-approach-fake';
import type { EventPricingData } from '@/lib/pricing/event-store';
import type { PriceSnapshot } from '@/lib/pricing/snapshot';
import { quoteTrip } from '@/lib/pricing/quote';
import { pricingInput, quoteWhatsAppTrip, pricingAdapter } from './pricing-adapter';
import { classifyWorkerFailure } from './worker';
import type { BookingDraft } from './conversation';
const req = createRequire(import.meta.url);
const base: BookingDraft = { pickup: 'rotterdam', dropoff: 'schiphol', date: '2099-10-24', time: '15:00', persons: 2, luggage: 'handbagage', rideType: 'enkel' };
function eventData(mode: 'live'|'shadow'): EventPricingData {
  return {
    config: { mode, concurrentUpgradeEnabled: false, concurrentUpgradeMinEvents: 2, concurrentUpgradeMinLevel: 'high', maxImpactLevel: 'extreme' },
    events: [{ id:'evt',slug:'test',name:'Test',category:'festival',city:'Rotterdam',venue:null,startsAt:'2099-10-20T00:00:00Z',endsAt:'2099-10-26T00:00:00Z',status:'confirmed',expectedAttendance:null,sourceUrl:'https://example.invalid',sourceName:null,sourceType:'organiser',sourcePriority:1,verificationStatus:'verified',lastVerifiedAt:null,lastChangedAt:null,requiresAnnualConfirmation:true,pricingEnabled:true }],
    windows: [{ id:'win',eventId:'evt',startsAt:'2099-10-24T06:00:00Z',endsAt:'2099-10-24T20:00:00Z',phase:'active',pickupImpactLevel:'high',dropoffImpactLevel:'none' }],
    zones: [{ id:'zone',eventId:'evt',zoneType:'location_slug',locationSlug:'rotterdam',gemeenteNaam:null,locality:null,postcode4:null,direction:'both',impactOverride:null }],
    rules: new Map([['none',{feeCents:0,maxUpliftPct:null}],['high',{feeCents:2500,maxUpliftPct:null}]]),
  };
}
function setup(name: string) {
  const snapshots: PriceSnapshot[] = []; const shadow: unknown[] = [];
  const dbFixtures: ResolveQuoteDeps = {
    findLocation: async raw => name === 'distance' ? null : { id: raw, slug: raw, name: raw, active: true, location_type: raw === 'schiphol' ? 'airport' : 'district', city_id: null },
    findVehicleClass: async () => { if (name === 'database failure') throw new Error('offline'); return { id:'veh',code:'executive-ev',max_passengers:3,max_luggage:3,active:true }; },
    findFixedRoute: async () => name === 'distance' ? null : { price:69,return_price:120,currency:'EUR',distance_km:14,estimated_duration_min:24,vat_rate:9,source_label:'fixture',valid_from:'2026-01-01T00:00:00Z',active:true },
    getRoute: wrapGetRouteWithNeutralApproach(async () => ({distanceKm:20,durationMin:30})),
    ...neutralPickupApproachDeps,
  };
  return { snapshots, shadow, deps: {
    calculate: (input: Parameters<typeof calculateBookingPrice>[0]) => calculateBookingPrice(input, {
      getQuote: input => resolveQuoteWith(input, dbFixtures),
      now: () => new Date('2099-10-20T10:00:00Z'), generateQuoteId: () => '0192f0c0-0000-7000-8000-000000000abc',
      loadEventPricing: async () => name === 'event live' ? eventData('live') : name === 'event shadow' ? eventData('shadow') : null,
      recordShadowLog: async entries => { shadow.push(...entries); },
    }),
    persist: async (snapshot: PriceSnapshot) => { snapshots.push(snapshot); return name !== 'snapshot failure'; },
  } };
}
async function http(which: 'original'|'current', body: Record<string, unknown>, deps: ReturnType<typeof setup>['deps']) {
  const exports: { POST?: (r: Request) => Promise<Response> } = {};
  const source = readFileSync(which === 'original' ? 'lib/pricing/fixtures/quote-route-before-gate3.ts.txt' : 'app/api/pricing/quote/route.ts','utf8');
  const overrides: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (payload: unknown, init: ResponseInit) => Response.json(payload,init) } },
    '@/lib/security/rate-limit': { clientIp: () => 'test', rateLimit: () => ({limited:false}) },
    '@/lib/pricing/engine': { calculateBookingPrice: deps.calculate },
    '@/lib/pricing/snapshot-store': { persistPriceSnapshot: deps.persist },
    '@/lib/pricing/quote': { quoteTrip: (input: Record<string, unknown>) => quoteTrip(input,deps) },
  };
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    { exports, require: (id: string) => id in overrides ? overrides[id] : req('../'+id.slice('@/lib/'.length)+'.ts'), Date, TextEncoder });
  const response = await exports.POST!(new Request('https://example.invalid',{method:'POST',body:JSON.stringify(body)}));
  return { status: response.status, payload: await response.json(), headers: Object.fromEntries(response.headers) };
}
const scenarios: [string, Partial<BookingDraft>][] = [
  ['fixed airport',{}], ['distance',{}], ['retour',{rideType:'retour',returnDate:'2099-10-25',returnTime:'23:00'}], ['night',{time:'23:30'}],
  ['event live',{}], ['event shadow',{}], ['invalid address',{pickup:''}], ['invalid date',{date:'2099-02-31'}], ['invalid luggage',{luggage:'bogus'}],
  ['capacity',{persons:4}], ['manual luggage',{luggage:'overleg'}], ['invalid return',{rideType:'retour'}], ['database failure',{}], ['snapshot failure',{}],
];
for (const [name,patch] of scenarios) test(`Gate 3 pricing parity: ${name}`,async () => {
  const draft = {...base,...patch};
  const a=setup(name),b=setup(name),c=setup(name),d=setup(name);
  const oldHttp=await http('original',pricingInput(draft),a.deps);
  const newHttp=await http('current',pricingInput(draft),b.deps);
  const canonical=await quoteTrip(pricingInput(draft),c.deps);
  const adapter=await quoteWhatsAppTrip(draft,d.deps);
  assert.deepEqual(newHttp,oldHttp); assert.deepEqual(adapter,canonical);
  assert.deepEqual(JSON.parse(JSON.stringify({status:adapter.status,payload:adapter.payload})),{status:oldHttp.status,payload:oldHttp.payload});
  assert.deepEqual(a.snapshots,b.snapshots); assert.deepEqual(a.snapshots,c.snapshots); assert.deepEqual(c.snapshots,d.snapshots);
  assert.deepEqual(a.shadow,d.shadow);
  if(name==='event live') assert.ok(adapter.payload.eventFee);
  if(name==='event shadow') { assert.equal(adapter.payload.eventFee,undefined); assert.ok(d.shadow.length); }
  if(name==='database failure') assert.equal(adapter.status,500);
  if(name==='snapshot failure') assert.equal(adapter.status,503);
});
test('pricing validation fails permanently before engine; infrastructure failure stays conservative',async () => {
  for(const [name,draft,expected] of [['invalid address',{...base,pickup:''},'permanent_pre_effect'],['database failure',base,'unknown']] as const) {
    const adapter=pricingAdapter(setup(name).deps);
    try { await adapter.execute({id:'test',kind:'request_quote',payload:{draft,draftRevision:1},claim_token:'test',attempt:1}); assert.fail('expected rejection'); }
    catch(error) { assert.equal(classifyWorkerFailure(error),expected); }
  }
});
