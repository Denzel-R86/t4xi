"use client";

import { useMemo, useState } from "react";
import {
  simulate,
  scenarioServiceTypePct,
  scenarioCostIncrease,
  scenarioApplyRaises,
  scenarioCustomByService,
  type SimReport,
  type ServiceType,
  type RecommendationAction,
  type DataStatus,
} from "@/lib/pricing-brain";
import type { BrainDashboardData, BrainRouteView } from "./types";
import {
  ACTION_ORDER,
  buildOverview,
  topOpportunities,
  topRisks,
  highestMargins,
  lowestMargins,
} from "./metrics";

// ── design helpers ───────────────────────────────────────────────────────────
const cardCls = "rounded-card border border-line bg-card p-5 shadow-card";
const eur = (n: number) => `€ ${n.toFixed(2)}`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const arrow = "→";
const label = (slug: string) => slug.replace(/-/g, " ");

const ACTION_STYLES: Record<RecommendationAction, string> = {
  RAISE_URGENT: "bg-red-500/10 text-red-700",
  RAISE: "bg-amber-500/12 text-amber-700",
  LOWER: "bg-blue-500/10 text-blue-700",
  REPRICE_PSYCH: "bg-violet-500/10 text-violet-700",
  POSITION_PREMIUM: "bg-indigo-500/10 text-indigo-700",
  MANUAL_REVIEW: "bg-stone/15 text-secondary",
  HOLD: "bg-green-600/10 text-green-700",
};

const STATUS_STYLES: Record<DataStatus, string> = {
  active: "bg-green-600/10 text-green-700",
  estimated: "bg-amber-500/12 text-amber-700",
  stub: "bg-stone/15 text-secondary",
};

function Badge({ action }: { action: RecommendationAction }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${ACTION_STYLES[action]}`}>
      {action}
    </span>
  );
}

function Stat({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className={cardCls}>
      <div className="text-xs font-bold uppercase tracking-wider text-stone">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-ink">{value}</div>
      {hint ? <div className="mt-1 text-xs text-secondary">{hint}</div> : null}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-stone ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td className={`px-3 py-2 text-sm text-ink ${right ? "text-right" : "text-left"} ${mono ? "tabular-nums" : ""}`}>
      {children}
    </td>
  );
}

function Table({ headers, children, rightCols = [] }: { headers: string[]; children: React.ReactNode; rightCols?: number[] }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              {headers.map((h, i) => (
                <Th key={h} right={rightCols.includes(i)}>
                  {h}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── tabs ─────────────────────────────────────────────────────────────────────
type Tab = "overview" | "recommendations" | "simulator" | "metrics";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "recommendations", label: "Recommendations" },
  { key: "simulator", label: "Simulator" },
  { key: "metrics", label: "Metrics" },
];

export default function BrainDashboard({ data }: { data: BrainDashboardData }) {
  const { routes } = data;
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const overview = useMemo(() => buildOverview(routes), [routes]);
  const selected = useMemo(() => routes.find((r) => r.id === selectedId) ?? null, [routes, selectedId]);
  const openDetail = (id: string) => {
    setSelectedId(id);
    setTab("recommendations");
  };

  if (!data.configured) {
    return (
      <Shell generatedAt={data.generatedAt} routeCount={0}>
        <div className={cardCls}>
          <p className="text-sm text-secondary">
            Supabase is niet geconfigureerd (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY ontbreken). Er zijn geen
            routes om weer te geven.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell generatedAt={data.generatedAt} routeCount={data.routeCount}>
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-accent text-white" : "border border-line bg-card text-secondary hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview overview={overview} />}
      {tab === "recommendations" && (
        <>
          {selected && <RouteDetail route={selected} onClose={() => setSelectedId(null)} />}
          <Recommendations routes={routes} onSelect={openDetail} selectedId={selectedId} />
        </>
      )}
      {tab === "simulator" && <Simulator routes={routes} />}
      {tab === "metrics" && <Metrics routes={routes} overview={overview} onSelect={openDetail} />}
    </Shell>
  );
}

function Shell({ children, generatedAt, routeCount }: { children: React.ReactNode; generatedAt: string; routeCount: number }) {
  return (
    <main className="min-h-screen bg-fog px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-site">
        <header className="mb-6">
          <div className="text-xs font-bold uppercase tracking-[0.19em] text-stone">Intern · read-only</div>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Pricing Brain</h1>
          <p className="mt-1 text-sm text-secondary">
            {routeCount} routes · doorgerekend {new Date(generatedAt).toLocaleString("nl-NL")} · demo van de complete Brain
            (geen prijswijzigingen, geen writes).
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}

// ── 1. Overview ──────────────────────────────────────────────────────────────
function Overview({ overview }: { overview: ReturnType<typeof buildOverview> }) {
  const maxCount = Math.max(1, ...ACTION_ORDER.map((a) => overview.counts[a]));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat title="Routes" value={String(overview.routeCount)} />
        <Stat title="Gem. marge" value={pct(overview.avgMarginPct)} />
        <Stat title="Gem. confidence" value={overview.avgConfidence.toFixed(3)} />
        <Stat title="Verliesgevend" value={String(overview.lossMakingCount)} hint="routes met marge < 0" />
      </div>
      <div className={cardCls}>
        <div className="mb-4 text-sm font-semibold text-ink">Recommendations per type</div>
        <div className="space-y-2">
          {ACTION_ORDER.map((a) => (
            <div key={a} className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <Badge action={a} />
              </div>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(overview.counts[a] / maxCount) * 100}%` }}
                />
              </div>
              <div className="w-8 text-right text-sm tabular-nums text-ink">{overview.counts[a]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 2. Recommendation table ──────────────────────────────────────────────────
function Recommendations({
  routes,
  onSelect,
  selectedId,
}: {
  routes: BrainRouteView[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <Table
      headers={["Route", "Klasse", "Huidig", "Aanbevolen", "Δ", "Conf.", "Verw. marge", "Actie", ""]}
      rightCols={[2, 3, 4, 5, 6]}
    >
      {routes.map((r) => {
        const delta = r.recommendedPrice - r.currentPrice;
        return (
          <tr key={r.id} className={selectedId === r.id ? "bg-field" : undefined}>
            <Td>
              <span className="capitalize">
                {label(r.pickupSlug)} <span className="text-stone">{arrow}</span> {label(r.dropoffSlug)}
              </span>
            </Td>
            <Td>{r.vehicleClassCode}</Td>
            <Td right mono>{eur(r.currentPrice)}</Td>
            <Td right mono>{eur(r.recommendedPrice)}</Td>
            <Td right mono>
              <span className={delta > 0 ? "text-green-700" : delta < 0 ? "text-red-700" : "text-stone"}>
                {delta >= 0 ? "+" : "−"}
                {Math.abs(delta).toFixed(2)}
              </span>
            </Td>
            <Td right mono>{r.overallConfidence.toFixed(3)}</Td>
            <Td right mono>{r.expectedMarginPct === null ? "—" : pct(r.expectedMarginPct)}</Td>
            <Td>
              <Badge action={r.action} />
            </Td>
            <Td>
              <button
                onClick={() => onSelect(r.id)}
                className="rounded-field border border-line px-3 py-1 text-xs font-semibold text-secondary hover:text-ink"
              >
                Detail
              </button>
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}

// ── 3. Route detail (volledige explainer) ────────────────────────────────────
function RouteDetail({ route, onClose }: { route: BrainRouteView; onClose: () => void }) {
  const lines = route.explanation.lines;
  const maxAbs = Math.max(1, ...lines.map((l) => Math.abs(l.amount)));
  return (
    <div className={`mb-6 ${cardCls}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold capitalize text-ink">
            {label(route.pickupSlug)} <span className="text-stone">{arrow}</span> {label(route.dropoffSlug)}
          </div>
          <div className="mt-0.5 text-xs text-secondary">
            {route.vehicleClassCode} · {route.serviceType} · {route.distanceKm} km / {route.durationMin} min
          </div>
        </div>
        <button onClick={onClose} className="rounded-field border border-line px-3 py-1 text-xs font-semibold text-secondary hover:text-ink">
          Sluiten
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini title="Huidig" value={eur(route.currentPrice)} />
        <Mini title="Kosten" value={eur(route.cost)} />
        <Mini title="Marge" value={`${eur(route.marginEur)} (${pct(route.marginPct)})`} />
        <Mini title="Aanbevolen" value={eur(route.recommendedPrice)} />
      </div>

      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        Prijsopbouw <Badge action={route.action} />
      </div>
      <div className="space-y-1.5">
        {lines.map((l) => (
          <div key={l.factorKey} className="flex items-center gap-3">
            <div className="w-40 shrink-0 text-sm text-secondary">{l.label}</div>
            <div className="relative h-5 flex-1 rounded bg-subtle">
              <div
                className={`absolute top-0 h-full rounded ${l.amount >= 0 ? "bg-accent" : "bg-red-500"}`}
                style={{ left: "0%", width: `${(Math.abs(l.amount) / maxAbs) * 100}%` }}
              />
            </div>
            <div className="w-20 text-right text-sm tabular-nums text-ink">
              {l.amount >= 0 ? "+" : "−"}
              {Math.abs(l.amount).toFixed(2)}
            </div>
            <div className="w-14 text-right text-xs tabular-nums text-stone">{l.confidence.toFixed(2)}</div>
            <span className={`w-20 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold ${STATUS_STYLES[l.dataStatus]}`}>
              {l.dataStatus}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <div className="text-sm text-secondary">
          {route.explanation.stubbedFactors.length} slapende factoren · confidence {route.overallConfidence.toFixed(3)}
        </div>
        <div className="text-base font-semibold text-ink">= {eur(route.recommendedPrice)}</div>
      </div>
      <p className="mt-3 text-sm text-secondary">{route.rationale}</p>
    </div>
  );
}

function Mini({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-field border border-line bg-field px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-stone">{title}</div>
      <div className="mt-0.5 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

// ── 4. Simulator ─────────────────────────────────────────────────────────────
type SimKind = "airport" | "intercity" | "cost" | "raises" | "custom";
const SIM_KINDS: { key: SimKind; label: string }[] = [
  { key: "airport", label: "Airport +%" },
  { key: "intercity", label: "Intercity +%" },
  { key: "cost", label: "Kostenstijging +%" },
  { key: "raises", label: "Alleen RAISE toepassen" },
  { key: "custom", label: "Custom per service_type" },
];

function Simulator({ routes }: { routes: BrainRouteView[] }) {
  const [kind, setKind] = useState<SimKind>("airport");
  const [pctValue, setPctValue] = useState(8);
  const serviceTypes = useMemo(
    () => Array.from(new Set(routes.map((r) => r.serviceType))) as ServiceType[],
    [routes]
  );
  const [customMap, setCustomMap] = useState<Record<string, number>>({});

  const inputs = useMemo(() => routes.map((r) => r.sim), [routes]);
  const report: SimReport = useMemo(() => {
    switch (kind) {
      case "airport":
        return simulate(inputs, scenarioServiceTypePct("airport", pctValue));
      case "intercity":
        return simulate(inputs, scenarioServiceTypePct("intercity", pctValue));
      case "cost":
        return simulate(inputs, scenarioCostIncrease(pctValue));
      case "raises":
        return simulate(inputs, scenarioApplyRaises());
      case "custom":
        return simulate(inputs, scenarioCustomByService(customMap as Partial<Record<ServiceType, number>>));
    }
  }, [kind, pctValue, customMap, inputs]);

  const usesPct = kind === "airport" || kind === "intercity" || kind === "cost";

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div className="mb-4 flex flex-wrap gap-2">
          {SIM_KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => setKind(k.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                kind === k.key ? "bg-accent text-white" : "border border-line text-secondary hover:text-ink"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        {usesPct && (
          <label className="flex items-center gap-3 text-sm text-secondary">
            Percentage
            <input
              type="number"
              value={pctValue}
              onChange={(e) => setPctValue(Number(e.target.value))}
              className="w-24 rounded-field border border-line bg-field px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
            />
            %
          </label>
        )}

        {kind === "custom" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {serviceTypes.map((st) => (
              <label key={st} className="flex items-center gap-2 text-sm text-secondary">
                <span className="w-28 truncate">{st}</span>
                <input
                  type="number"
                  value={customMap[st] ?? 0}
                  onChange={(e) => setCustomMap((m) => ({ ...m, [st]: Number(e.target.value) }))}
                  className="w-20 rounded-field border border-line bg-field px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </label>
            ))}
          </div>
        )}

        {kind === "raises" && (
          <p className="text-sm text-secondary">Past uitsluitend de RAISE/RAISE_URGENT-adviezen van de Brain toe.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat title="Routes geraakt" value={`${report.routesAffected} / ${report.routesTotal}`} />
        <Stat
          title="Omzet (catalogus)"
          value={`${report.revenueDelta >= 0 ? "+" : "−"}${eur(Math.abs(report.revenueDelta))}`}
          hint={`${eur(report.revenueBefore)} ${arrow} ${eur(report.revenueAfter)}`}
        />
        <Stat
          title="Marge Δ"
          value={`${report.marginDelta >= 0 ? "+" : "−"}${eur(Math.abs(report.marginDelta))}`}
          hint={`gem. ${pct(report.avgMarginPctBefore)} ${arrow} ${pct(report.avgMarginPctAfter)}`}
        />
        <Stat
          title="Verliesgevend"
          value={`${report.lossMakingBefore} ${arrow} ${report.lossMakingAfter}`}
          hint={`${report.becameLossMaking.length} nieuw`}
        />
      </div>

      {report.becameLossMaking.length > 0 && (
        <Table headers={["Route", "Klasse", "Marge vóór", "Marge na"]} rightCols={[2, 3]}>
          {report.becameLossMaking.map((r) => (
            <tr key={`${r.pickupSlug}-${r.dropoffSlug}-${r.vehicleClassCode}`}>
              <Td>
                <span className="capitalize">
                  {label(r.pickupSlug)} <span className="text-stone">{arrow}</span> {label(r.dropoffSlug)}
                </span>
              </Td>
              <Td>{r.vehicleClassCode}</Td>
              <Td right mono>{eur(r.beforeMargin)}</Td>
              <Td right mono>
                <span className="text-red-700">{eur(r.afterMargin)}</span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 5. Metrics ───────────────────────────────────────────────────────────────
function Metrics({
  routes,
  overview,
  onSelect,
}: {
  routes: BrainRouteView[];
  overview: ReturnType<typeof buildOverview>;
  onSelect: (id: string) => void;
}) {
  const maxCount = Math.max(1, ...ACTION_ORDER.map((a) => overview.counts[a]));
  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div className="mb-4 text-sm font-semibold text-ink">Verdeling adviezen</div>
        <div className="flex items-end gap-3">
          {ACTION_ORDER.map((a) => (
            <div key={a} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-32 w-full items-end">
                <div
                  className="w-full rounded-t bg-accent"
                  style={{ height: `${(overview.counts[a] / maxCount) * 100}%` }}
                />
              </div>
              <div className="text-sm font-semibold tabular-nums text-ink">{overview.counts[a]}</div>
              <div className="text-[9px] uppercase tracking-wider text-stone">{a.replace("_", " ")}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RouteList title="Top kansen (grootste opwaartse ruimte)" routes={topOpportunities(routes, 5)} onSelect={onSelect} showTarget />
        <RouteList title="Top risico's (laagste marge)" routes={topRisks(routes, 5)} onSelect={onSelect} />
        <RouteList title="Hoogste marges" routes={highestMargins(routes, 5)} onSelect={onSelect} />
        <RouteList title="Laagste marges" routes={lowestMargins(routes, 5)} onSelect={onSelect} />
      </div>
    </div>
  );
}

function RouteList({
  title,
  routes,
  onSelect,
  showTarget,
}: {
  title: string;
  routes: BrainRouteView[];
  onSelect: (id: string) => void;
  showTarget?: boolean;
}) {
  return (
    <div className={cardCls}>
      <div className="mb-3 text-sm font-semibold text-ink">{title}</div>
      <div className="divide-y divide-line">
        {routes.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className="flex w-full items-center justify-between gap-3 py-2 text-left hover:opacity-80"
          >
            <span className="min-w-0 flex-1 truncate text-sm capitalize text-ink">
              {label(r.pickupSlug)} <span className="text-stone">{arrow}</span> {label(r.dropoffSlug)}
            </span>
            <span className="text-xs tabular-nums text-secondary">{pct(r.marginPct)}</span>
            <span className="text-sm tabular-nums text-ink">
              {showTarget ? `${eur(r.currentPrice)} ${arrow} ${eur(r.recommendedPrice)}` : eur(r.currentPrice)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
