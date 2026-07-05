"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";

const inputCls =
  "min-h-[44px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-3.5 text-sm font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";
const cardCls = "rounded-card border border-line bg-card p-5 shadow-card";

type Pagina = "overview" | "bookings" | "cms" | "pricing" | "fleet" | "partners" | "audit" | "settings";

const TABS: { key: Pagina; label: string; icon: string }[] = [
  { key: "overview", label: "Overzicht", icon: "layout-dashboard" },
  { key: "bookings", label: "Boekingen", icon: "calendar-check" },
  { key: "cms", label: "CMS", icon: "edit" },
  { key: "pricing", label: "Tarieven", icon: "coin" },
  { key: "fleet", label: "Vloot", icon: "car" },
  { key: "partners", label: "Partners", icon: "users" },
  { key: "audit", label: "Audit log", icon: "shield-check" },
  { key: "settings", label: "Instellingen", icon: "settings" },
];

type Boeking = { nr: string; klant: string; tel: string; van: string; naar: string; datum: string; tijd: string; prijs: string; status: string };

const BOEKINGEN: Boeking[] = [
  { nr: "B-1041", klant: "M. van Dijk", tel: "+31 6 11 22 33 44", van: "Almere Poort", naar: "Schiphol", datum: "5 jul 2026", tijd: "06:15", prijs: "€102", status: "bevestigd" },
  { nr: "B-1040", klant: "S. Bakker", tel: "+31 6 22 33 44 55", van: "Amsterdam Zuidas", naar: "Schiphol", datum: "5 jul 2026", tijd: "09:30", prijs: "€50", status: "lopend" },
  { nr: "B-1039", klant: "R. Jansen", tel: "+31 6 33 44 55 66", van: "Rotterdam Centrum", naar: "Schiphol", datum: "4 jul 2026", tijd: "14:00", prijs: "€119", status: "afgerond" },
  { nr: "B-1038", klant: "K. de Vries", tel: "+31 6 44 55 66 77", van: "Utrecht Centrum", naar: "Amsterdam", datum: "4 jul 2026", tijd: "19:45", prijs: "€69", status: "afgerond" },
  { nr: "B-1037", klant: "L. Peters", tel: "+31 6 55 66 77 88", van: "Den Haag", naar: "Schiphol", datum: "3 jul 2026", tijd: "05:30", prijs: "€107", status: "geannuleerd" },
];

const VLOOT = [
  { voertuig: "Tesla Model Y", kenteken: "X-001-TX", regio: "Amsterdam", type: "Elektrisch", status: "Actief", km: "48.210", apk: "03-2027" },
  { voertuig: "Tesla Model Y", kenteken: "X-002-TX", regio: "Rotterdam", type: "Elektrisch", status: "Actief", km: "36.780", apk: "06-2027" },
  { voertuig: "Lynk & Co 01", kenteken: "X-003-TX", regio: "Amsterdam", type: "Plug-in Hybrid", status: "Actief", km: "29.455", apk: "01-2027" },
];

const PARTNERS = [
  { naam: "A. Yilmaz", regio: "Amsterdam", pakket: "Pro", voertuig: "Tesla Model Y 2023", datum: "28 jun 2026", status: "In behandeling" },
  { naam: "M. el Idrissi", regio: "Rotterdam", pakket: "Starter", voertuig: "Kia EV6 2024", datum: "22 jun 2026", status: "Goedgekeurd" },
  { naam: "J. Visser", regio: "Almere / Flevoland", pakket: "Elite", voertuig: "BMW i5 2025", datum: "15 jun 2026", status: "Goedgekeurd" },
];

const AUDIT = [
  "05 jul 2026 14:32 — CMS: hero-tekst bijgewerkt",
  "05 jul 2026 11:08 — Boeking B-1041 bevestigd",
  "04 jul 2026 16:45 — Tarief Almere Poort → Schiphol gewijzigd (€102)",
  "04 jul 2026 09:12 — Partneraanvraag J. Visser goedgekeurd",
  "03 jul 2026 20:01 — Inlog beheerder",
];

const SCHIPHOL_PRIJZEN = [
  { van: "Almere Poort", prijs: 102, km: 39 },
  { van: "Almere Stad", prijs: 104, km: 40 },
  { van: "Amsterdam Zuidas", prijs: 50, km: 10 },
  { van: "Amsterdam Centrum", prijs: 57, km: 14 },
  { van: "Rotterdam", prijs: 119, km: 80 },
  { van: "Utrecht Centrum", prijs: 110, km: 44 },
  { van: "Den Haag", prijs: 107, km: 43 },
];

function StatusChip({ s }: { s: string }) {
  const kleur =
    s === "afgerond" || s === "Goedgekeurd" || s === "Actief"
      ? "bg-green-600/10 text-green-700"
      : s === "geannuleerd"
        ? "bg-red-500/10 text-red-600"
        : "bg-accent/10 text-accent";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${kleur}`}>{s}</span>;
}

function Tabel({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
              {headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function SaveButton({ children = "Opslaan" }: { children?: React.ReactNode }) {
  const [saved, setSaved] = useState(false);
  return (
    <p className="mt-4 flex items-center gap-3">
      <button
        type="button"
        onClick={() => setSaved(true)}
        className="flex min-h-[42px] items-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
      >
        <Icon name="save" size={15} />
        {children}
      </button>
      {saved && <span className="text-xs text-green-600">✓ Opgeslagen</span>}
    </p>
  );
}

/** Beheerdashboard uit dashboard.html — demo-login + alle tabbladen met voorbeelddata. */
export default function AdminDashboard() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [pagina, setPagina] = useState<Pagina>("overview");
  const [filter, setFilter] = useState("");

  if (!loggedIn) {
    return (
      <div className="mx-auto max-w-sm px-6 py-20 md:py-28">
        <div className="relative overflow-hidden rounded-[28px] border border-line bg-card p-7 text-center shadow-hero-card">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle" />
          <p className="font-display text-[26px] font-extrabold tracking-[3px] text-ink">
            T<span className="text-stone">4</span>XI
          </p>
          <p className="mt-1 text-sm text-secondary">Beheer Dashboard</p>
          <form
            className="mt-6 grid gap-4 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              setLoggedIn(true);
            }}
          >
            <div>
              <label htmlFor="d-user" className={labelCls}>Gebruikersnaam</label>
              <input id="d-user" placeholder="admin" autoComplete="username" spellCheck={false} className={inputCls} />
            </div>
            <div>
              <label htmlFor="d-pass" className={labelCls}>Wachtwoord</label>
              <input id="d-pass" type="password" placeholder="••••••••" autoComplete="current-password" className={inputCls} />
            </div>
            <button type="submit" className="flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-accent font-display text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover">
              <Icon name="lock" size={16} />
              Inloggen
            </button>
            <p className="text-center text-xs text-secondary">Demo-omgeving — elke invoer logt in.</p>
          </form>
        </div>
      </div>
    );
  }

  const zichtbaar = BOEKINGEN.filter((b) => !filter || b.status === filter);

  return (
    <div className="mx-auto max-w-site px-6 py-10 md:py-12">
      {/* Topbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-5">
        <p className="font-display text-xl font-extrabold tracking-[3px] text-ink">
          T<span className="text-stone">4</span>XI
        </p>
        <span className="rounded-full bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Beheer</span>
        <div className="ml-auto flex items-center gap-3 text-sm text-secondary">
          admin
          <button
            type="button"
            onClick={() => setLoggedIn(false)}
            className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs hover:bg-fog"
          >
            <Icon name="logout" size={13} />
            Uitloggen
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="mt-5 flex flex-wrap gap-1.5" aria-label="Dashboardnavigatie">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setPagina(t.key)}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors ${
              pagina === t.key ? "bg-accent text-white" : "text-secondary hover:bg-ink/5 hover:text-ink"
            }`}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-8">
        {pagina === "overview" && (
          <section>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { val: "38", label: "Ritten deze maand", sub: "via boekingen" },
                { val: "€3.184", label: "Omzet", sub: "exclusief BTW" },
                { val: "3", label: "Actieve partners", sub: "chauffeurs" },
                { val: "4.9", label: "Gemiddeld rating", sub: "van klanten" },
              ].map((s) => (
                <div key={s.label} className={cardCls}>
                  <div className="font-display text-[28px] font-bold text-accent">{s.val}</div>
                  <div className="mt-1 text-sm font-medium text-ink">{s.label}</div>
                  <div className="text-xs text-stone">{s.sub}</div>
                </div>
              ))}
            </div>
            <div className="mb-3 mt-8 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Recente boekingen</h2>
              <button type="button" onClick={() => setPagina("bookings")} className="text-sm text-accent hover:underline">
                Alles zien →
              </button>
            </div>
            <Tabel headers={["#", "Klant", "Route", "Datum", "Prijs", "Status"]}>
              {BOEKINGEN.slice(0, 4).map((b) => (
                <tr key={b.nr} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 text-secondary">{b.nr}</td>
                  <td className="px-4 py-3 text-ink">{b.klant}</td>
                  <td className="px-4 py-3 text-secondary">{b.van} → {b.naar}</td>
                  <td className="px-4 py-3 text-secondary">{b.datum}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{b.prijs}</td>
                  <td className="px-4 py-3"><StatusChip s={b.status} /></td>
                </tr>
              ))}
            </Tabel>
          </section>
        )}

        {pagina === "bookings" && (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-ink">Alle boekingen</h2>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none">
                <option value="">Alle statussen</option>
                <option value="bevestigd">Bevestigd</option>
                <option value="lopend">Lopend</option>
                <option value="afgerond">Afgerond</option>
                <option value="geannuleerd">Geannuleerd</option>
              </select>
            </div>
            <Tabel headers={["#", "Klant", "Telefoon", "Van", "Naar", "Datum", "Tijd", "Prijs", "Status"]}>
              {zichtbaar.map((b) => (
                <tr key={b.nr} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 text-secondary">{b.nr}</td>
                  <td className="px-4 py-3 text-ink">{b.klant}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-secondary">{b.tel}</td>
                  <td className="px-4 py-3 text-secondary">{b.van}</td>
                  <td className="px-4 py-3 text-secondary">{b.naar}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-secondary">{b.datum}</td>
                  <td className="px-4 py-3 text-secondary">{b.tijd}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{b.prijs}</td>
                  <td className="px-4 py-3"><StatusChip s={b.status} /></td>
                </tr>
              ))}
            </Tabel>
          </section>
        )}

        {pagina === "cms" && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className={cardCls}>
              <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink"><Icon name="home" size={16} className="text-accent" />Hero sectie</h2>
              <div className="grid gap-3.5">
                <div><label className={labelCls}>Hoofd headline regel 1</label><input defaultValue="Van voordeur" className={inputCls} /></div>
                <div><label className={labelCls}>Hoofd headline regel 2</label><input defaultValue="tot vertrekhal." className={inputCls} /></div>
                <div><label className={labelCls}>Sub-headline</label><textarea defaultValue="Vaste prijzen. Tesla Model Y. 24/7 beschikbaar." className={`${inputCls} min-h-20 resize-y py-2.5`} /></div>
                <div><label className={labelCls}>WhatsApp nummer</label><input defaultValue="+31634744522" className={inputCls} /></div>
              </div>
              <SaveButton />
            </div>
            <div className={cardCls}>
              <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink"><Icon name="building" size={16} className="text-accent" />Bedrijfsgegevens</h2>
              <div className="grid gap-3.5">
                <div><label className={labelCls}>Bedrijfsnaam</label><input defaultValue="T4XI.nl" className={inputCls} /></div>
                <div><label className={labelCls}>E-mail</label><input type="email" defaultValue="booking@t4xi.nl" className={inputCls} /></div>
                <div><label className={labelCls}>KVK nummer</label><input defaultValue="80673813" className={inputCls} /></div>
                <div><label className={labelCls}>Adres</label><input defaultValue="Almere, Flevoland" className={inputCls} /></div>
              </div>
              <SaveButton />
            </div>
            <div className={`${cardCls} lg:col-span-2`}>
              <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink"><Icon name="edit" size={16} className="text-accent" />SEO instellingen</h2>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div><label className={labelCls}>Meta title (index)</label><input defaultValue="T4XI — Premium taxi & elektrische mobiliteit" className={inputCls} /></div>
                <div><label className={labelCls}>Google Analytics ID</label><input placeholder="G-XXXXXXXXXX" className={inputCls} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Meta description</label><textarea defaultValue="T4XI biedt premium taxivervoer in Amsterdam en Rotterdam." className={`${inputCls} min-h-20 resize-y py-2.5`} /></div>
              </div>
              <SaveButton />
            </div>
          </section>
        )}

        {pagina === "pricing" && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className={cardCls}>
              <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink"><Icon name="plane" size={16} className="text-accent" />Schiphol tarieven</h2>
              <Tabel headers={["Van", "Prijs (€)", "Km"]}>
                {SCHIPHOL_PRIJZEN.map((p) => (
                  <tr key={p.van} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 text-ink">{p.van}</td>
                    <td className="px-4 py-2"><input type="number" defaultValue={p.prijs} className="w-24 rounded-md border border-line bg-field px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent" /></td>
                    <td className="px-4 py-2.5 text-secondary">~{p.km} km</td>
                  </tr>
                ))}
              </Tabel>
            </div>
            <div className={cardCls}>
              <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink"><Icon name="map-pin" size={16} className="text-accent" />Toeslagen</h2>
              <div className="grid gap-3.5">
                <div><label className={labelCls}>Nachttarief (23:00-06:00) %</label><input type="number" defaultValue={15} className={inputCls} /></div>
                <div><label className={labelCls}>Retour factor (×)</label><input type="number" defaultValue={1.8} step={0.1} className={inputCls} /></div>
                <div><label className={labelCls}>Dagtocht minimum (€)</label><input type="number" defaultValue={295} className={inputCls} /></div>
                <div><label className={labelCls}>Bagage toeslag (€)</label><input type="number" defaultValue={0} className={inputCls} /></div>
              </div>
              <SaveButton>Tarieven opslaan</SaveButton>
            </div>
          </section>
        )}

        {pagina === "fleet" && (
          <section>
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Vloot beheer</h2>
            <Tabel headers={["Voertuig", "Kenteken", "Regio", "Type", "Status", "Km stand", "APK"]}>
              {VLOOT.map((v) => (
                <tr key={v.kenteken} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 text-ink">{v.voertuig}</td>
                  <td className="px-4 py-3 text-secondary">{v.kenteken}</td>
                  <td className="px-4 py-3 text-secondary">{v.regio}</td>
                  <td className="px-4 py-3 text-secondary">{v.type}</td>
                  <td className="px-4 py-3"><StatusChip s={v.status} /></td>
                  <td className="px-4 py-3 text-secondary">{v.km}</td>
                  <td className="px-4 py-3 text-secondary">{v.apk}</td>
                </tr>
              ))}
            </Tabel>
          </section>
        )}

        {pagina === "partners" && (
          <section>
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Partner aanvragen</h2>
            <Tabel headers={["Naam", "Regio", "Pakket", "Voertuig", "Datum", "Status"]}>
              {PARTNERS.map((p) => (
                <tr key={p.naam} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 text-ink">{p.naam}</td>
                  <td className="px-4 py-3 text-secondary">{p.regio}</td>
                  <td className="px-4 py-3 text-secondary">{p.pakket}</td>
                  <td className="px-4 py-3 text-secondary">{p.voertuig}</td>
                  <td className="px-4 py-3 text-secondary">{p.datum}</td>
                  <td className="px-4 py-3"><StatusChip s={p.status} /></td>
                </tr>
              ))}
            </Tabel>
          </section>
        )}

        {pagina === "audit" && (
          <section>
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Audit log</h2>
            <div className={cardCls}>
              <ul className="flex flex-col gap-2.5">
                {AUDIT.map((a) => (
                  <li key={a} className="flex items-start gap-2.5 border-b border-line/50 pb-2.5 text-[13px] text-secondary last:border-0 last:pb-0">
                    <Icon name="shield-check" size={14} className="mt-0.5 shrink-0 text-accent" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {pagina === "settings" && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className={cardCls}>
              <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink"><Icon name="lock" size={16} className="text-accent" />Wachtwoord wijzigen</h2>
              <div className="grid gap-3.5">
                <div><label className={labelCls}>Huidig wachtwoord</label><input type="password" className={inputCls} /></div>
                <div><label className={labelCls}>Nieuw wachtwoord</label><input type="password" className={inputCls} /></div>
                <div><label className={labelCls}>Bevestig nieuw wachtwoord</label><input type="password" className={inputCls} /></div>
              </div>
              <SaveButton>Wachtwoord wijzigen</SaveButton>
            </div>
            <div className={cardCls}>
              <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink"><Icon name="bell" size={16} className="text-accent" />Notificaties</h2>
              <div className="grid gap-3.5">
                <div><label className={labelCls}>E-mail voor nieuwe boekingen</label><input type="email" defaultValue="booking@t4xi.nl" className={inputCls} /></div>
                <div>
                  <label className={labelCls}>WhatsApp notificaties</label>
                  <select className={inputCls}><option>Aan</option><option>Uit</option></select>
                </div>
                <div><label className={labelCls}>Sessie timeout (minuten)</label><input type="number" defaultValue={30} min={5} max={480} className={inputCls} /></div>
              </div>
              <SaveButton />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
