"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";

const inputCls =
  "min-h-[48px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";
const cardCls = "overflow-hidden rounded-card border border-line bg-card shadow-card";

type Sectie = "overview" | "book" | "rides" | "profile" | "addresses" | "invoices";

const NAV: { key: Sectie; label: string; icon: string }[] = [
  { key: "overview", label: "Overzicht", icon: "layout-dashboard" },
  { key: "book", label: "Rit boeken", icon: "car" },
  { key: "rides", label: "Mijn ritten", icon: "history" },
  { key: "profile", label: "Mijn profiel", icon: "user" },
  { key: "addresses", label: "Opgeslagen adressen", icon: "map-pin" },
  { key: "invoices", label: "Facturen", icon: "receipt" },
];

const RITTEN = [
  { datum: "14 maart 2026", route: "Amstelveenseweg → Schiphol", chauffeur: "Ahmed", voertuig: "Tesla Model Y — AMS", bedrag: "€52", status: "Afgerond" },
  { datum: "28 februari 2026", route: "Zuidas → Rotterdam CS", chauffeur: "Mohammed", voertuig: "Lynk & Co 01", bedrag: "€78", status: "Afgerond" },
  { datum: "3 februari 2026", route: "Schiphol → Thuis", chauffeur: "Ahmed", voertuig: "Tesla Model Y — AMS", bedrag: "€54", status: "Afgerond" },
  { datum: "10 januari 2026", route: "Thuis → Bruiloft Venue", chauffeur: "Mohammed", voertuig: "Lynk & Co 01", bedrag: "€35", status: "Afgerond" },
  { datum: "5 juni 2026", route: "Thuis → Schiphol", chauffeur: "—", voertuig: "Tesla Model Y — AMS", bedrag: "€49", status: "Aankomend" },
];

const ADRESSEN = [
  { icon: "home", label: "Thuis", adres: "Amstelveenseweg 140, Amsterdam" },
  { icon: "building", label: "Kantoor", adres: "Zuidas, Gustav Mahlerplein, Amsterdam" },
  { icon: "plane", label: "Schiphol", adres: "Schiphol Plaza, Luchthaven Schiphol" },
];

const FACTUREN = [
  { nr: "#T4X-2026-014", datum: "14 maart 2026", omschrijving: "Rit Amsterdam → Schiphol", bedrag: "€52" },
  { nr: "#T4X-2026-013", datum: "28 februari 2026", omschrijving: "Rit Amsterdam → Rotterdam", bedrag: "€78" },
  { nr: "#T4X-2026-012", datum: "3 februari 2026", omschrijving: "Rit Schiphol → Amsterdam", bedrag: "€54" },
];

function Status({ s }: { s: string }) {
  const done = s === "Afgerond";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${done ? "bg-green-600/10 text-green-700" : "bg-accent/10 text-accent"}`}>
      {s}
    </span>
  );
}

function PageHeader({ title, sub }: { title: React.ReactNode; sub: string }) {
  return (
    <header className="mb-7">
      <h1 className="font-display text-3xl font-bold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-secondary">{sub}</p>
    </header>
  );
}

/** Klantportaal uit klant.html: login/registratie + demo-dashboard. */
export default function KlantPortal() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [sectie, setSectie] = useState<Sectie>("overview");
  const [saved, setSaved] = useState(false);
  const [booked, setBooked] = useState(false);

  if (!loggedIn) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 md:py-24">
        <div className="relative overflow-hidden rounded-[28px] border border-line bg-card p-7 text-center shadow-hero-card">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle" />
          <p className="font-display text-[26px] font-extrabold tracking-[3px] text-ink">
            T<span className="text-stone">4</span>XI
          </p>
          <p className="mt-1 text-sm text-secondary">Uw persoonlijke ritportaal</p>
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-line bg-fog p-1">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md py-2.5 text-sm font-medium transition-colors ${tab === t ? "bg-accent text-white" : "text-secondary hover:text-ink"}`}
              >
                {t === "login" ? "Inloggen" : "Registreren"}
              </button>
            ))}
          </div>

          <form
            className="mt-6 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              setLoggedIn(true);
            }}
          >
            {tab === "login" ? (
              <div className="grid gap-4">
                <div>
                  <label htmlFor="l-email" className={labelCls}>E-mailadres</label>
                  <input id="l-email" type="email" placeholder="uw@email.nl" autoComplete="email" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="l-pass" className={labelCls}>Wachtwoord</label>
                  <input id="l-pass" type="password" placeholder="••••••••" autoComplete="current-password" className={inputCls} />
                </div>
                <button type="submit" className="flex min-h-[48px] items-center justify-center rounded-md bg-accent font-display text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover">
                  Inloggen
                </button>
                <p className="text-center text-xs text-stone">of</p>
                <button
                  type="button"
                  onClick={() => setLoggedIn(true)}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-whatsapp/15 text-sm font-medium text-[#0b6b3a] transition-colors hover:bg-whatsapp/25"
                >
                  <Icon name="whatsapp" size={19} />
                  Doorgaan via WhatsApp
                </button>
                <p className="text-center text-xs leading-relaxed text-secondary">
                  <a href="#" className="text-accent hover:underline">Wachtwoord vergeten?</a>
                  <br />
                  Nog geen account?{" "}
                  <button type="button" className="text-accent hover:underline" onClick={() => setTab("register")}>
                    Registreer hier gratis.
                  </button>
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="r-vn" className={labelCls}>Voornaam</label>
                    <input id="r-vn" placeholder="Jan" autoComplete="given-name" className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="r-an" className={labelCls}>Achternaam</label>
                    <input id="r-an" placeholder="Jansen" autoComplete="family-name" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label htmlFor="r-email" className={labelCls}>E-mailadres</label>
                  <input id="r-email" type="email" placeholder="uw@email.nl" autoComplete="email" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="r-tel" className={labelCls}>Telefoonnummer</label>
                  <input id="r-tel" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="r-pass" className={labelCls}>Wachtwoord</label>
                  <input id="r-pass" type="password" placeholder="Minimaal 8 tekens" autoComplete="new-password" className={inputCls} />
                </div>
                <button type="submit" className="flex min-h-[48px] items-center justify-center rounded-md bg-accent font-display text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover">
                  Account aanmaken
                </button>
                <p className="text-center text-xs leading-relaxed text-secondary">
                  Door te registreren gaat u akkoord met onze Algemene
                  voorwaarden en ons Privacybeleid.
                </p>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-site gap-8 px-6 py-10 md:py-14 lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside className="h-fit rounded-card border border-line bg-card p-5 shadow-card">
        <div className="border-b border-line pb-5 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent font-display text-lg font-bold text-white">
            JJ
          </span>
          <p className="mt-2.5 font-display font-semibold text-ink">Jan Jansen</p>
          <p className="text-xs text-secondary">jan@email.nl</p>
        </div>
        <nav className="mt-4 flex flex-col gap-0.5" aria-label="Portaalnavigatie">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => setSectie(n.key)}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                sectie === n.key ? "bg-accent text-white" : "text-secondary hover:bg-fog hover:text-ink"
              }`}
            >
              <Icon name={n.icon} size={17} />
              {n.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLoggedIn(false)}
            className="mt-3 flex items-center gap-3 rounded-md border-t border-line px-3 pb-2.5 pt-4 text-left text-sm text-secondary hover:text-ink"
          >
            <Icon name="logout" size={17} />
            Uitloggen
          </button>
        </nav>
      </aside>

      {/* Main */}
      <div>
        {sectie === "overview" && (
          <section>
            <PageHeader title={<>Goedemorgen, <span className="text-accent">Jan</span></>} sub="Hier is een overzicht van uw T4XI activiteit" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { icon: "car", val: "14", label: "Totale ritten" },
                { icon: "coin", val: "€612", label: "Besteed dit jaar" },
                { icon: "star", val: "4.9", label: "Gem. beoordeling" },
                { icon: "plane", val: "6", label: "Schiphol transfers" },
              ].map((s) => (
                <div key={s.label} className="rounded-card border border-line bg-card p-4 shadow-card">
                  <Icon name={s.icon} size={20} className="text-accent" />
                  <div className="mt-2 font-display text-2xl font-bold text-ink">{s.val}</div>
                  <div className="text-xs text-secondary">{s.label}</div>
                </div>
              ))}
            </div>

            <div className={`mt-6 ${cardCls} p-6`}>
              <h2 className="font-display text-lg font-semibold text-ink">Snel een rit boeken</h2>
              <p className="mt-1 text-[13px] text-secondary">
                Uw gegevens zijn vooringevuld. Kies een opgeslagen adres of voer een nieuw adres in.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Van (opgeslagen adressen)</label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {["🏠 Thuis", "🏢 Kantoor", "✈️ Schiphol"].map((c) => (
                      <span key={c} className="cursor-pointer rounded-full border border-line bg-fog px-3 py-1 text-xs text-secondary hover:text-ink">{c}</span>
                    ))}
                  </div>
                  <input placeholder="Of typ een adres..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Naar</label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {["✈️ Schiphol", "🚉 Rotterdam CS"].map((c) => (
                      <span key={c} className="cursor-pointer rounded-full border border-line bg-fog px-3 py-1 text-xs text-secondary hover:text-ink">{c}</span>
                    ))}
                  </div>
                  <input placeholder="Bestemming..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Datum</label>
                  <input type="date" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Tijd</label>
                  <input type="time" defaultValue="08:00" className={inputCls} />
                </div>
              </div>
              {booked && (
                <p className="mt-4 flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-[13px] text-green-700">
                  <Icon name="check" size={15} />
                  Boeking ontvangen! Wij bevestigen via WhatsApp of e-mail.
                </p>
              )}
              <button
                type="button"
                onClick={() => setBooked(true)}
                className="mt-4 flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-accent px-6 font-display text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
              >
                <Icon name="calendar-check" size={16} />
                Bevestigen
              </button>
            </div>

            <h2 className="mb-3 mt-8 font-display text-lg font-semibold text-ink">Recente ritten</h2>
            <RidesTable rows={RITTEN.slice(0, 2).concat(RITTEN.slice(-1))} compact />
          </section>
        )}

        {sectie === "rides" && (
          <section>
            <PageHeader title="Mijn ritten" sub="Overzicht van al uw T4XI ritten" />
            <RidesTable rows={RITTEN} />
          </section>
        )}

        {sectie === "book" && (
          <section>
            <PageHeader title="Rit boeken" sub="Boek uw volgende rit met uw opgeslagen gegevens" />
            <div className={`${cardCls} max-w-xl p-7`}>
              <p className="mb-5 text-[13px] text-secondary">Uw naam en contactgegevens zijn automatisch ingevuld.</p>
              <div className="grid gap-4">
                <div><label className={labelCls}>Van</label><input placeholder="Vertrekadres" className={inputCls} /></div>
                <div><label className={labelCls}>Naar</label><input placeholder="Bestemming" className={inputCls} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>Datum</label><input type="date" className={inputCls} /></div>
                  <div><label className={labelCls}>Tijd</label><input type="time" defaultValue="08:00" className={inputCls} /></div>
                </div>
              </div>
              {booked && (
                <p className="mt-4 flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-[13px] text-green-700">
                  <Icon name="check" size={15} />
                  Boeking ontvangen! Wij bevestigen via WhatsApp of e-mail.
                </p>
              )}
              <button
                type="button"
                onClick={() => setBooked(true)}
                className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-accent font-display text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
              >
                <Icon name="calendar-check" size={16} />
                Rit aanvragen
              </button>
            </div>
          </section>
        )}

        {sectie === "profile" && (
          <section>
            <PageHeader title="Mijn profiel" sub="Uw gegevens en voorkeuren" />
            <div className={`${cardCls} p-7`}>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-[2px] text-accent">Persoonlijke gegevens</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={labelCls}>Voornaam</label><input defaultValue="Jan" className={inputCls} /></div>
                <div><label className={labelCls}>Achternaam</label><input defaultValue="Jansen" className={inputCls} /></div>
                <div><label className={labelCls}>E-mailadres</label><input type="email" defaultValue="jan@email.nl" className={inputCls} /></div>
                <div><label className={labelCls}>Telefoonnummer</label><input type="tel" defaultValue="+31 6 12 34 56 78" className={inputCls} /></div>
              </div>
              <h2 className="mb-4 mt-8 text-xs font-bold uppercase tracking-[2px] text-accent">Betaalvoorkeur</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Standaard betaalmethode</label>
                  <select className={inputCls}>
                    <option>iDEAL</option>
                    <option>Pin in de auto</option>
                    <option>Contant</option>
                    <option>Maandfactuur (zakelijk)</option>
                  </select>
                </div>
                <div><label className={labelCls}>Factuuradres (zakelijk)</label><input placeholder="Bedrijfsnaam (optioneel)" className={inputCls} /></div>
              </div>
              <h2 className="mb-4 mt-8 text-xs font-bold uppercase tracking-[2px] text-accent">Meldingen</h2>
              <div className="flex flex-col gap-3.5">
                {[
                  { label: "Boekingsbevestiging per e-mail", checked: true },
                  { label: "WhatsApp-melding wanneer chauffeur onderweg is", checked: true },
                  { label: "Aanbiedingen en nieuws van T4XI", checked: false },
                ].map((m) => (
                  <label key={m.label} className="flex cursor-pointer items-center gap-3 text-sm text-ink">
                    <input type="checkbox" defaultChecked={m.checked} className="h-4 w-4 accent-[#28313B]" />
                    {m.label}
                  </label>
                ))}
              </div>
              {saved && (
                <p className="mt-5 flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-[13px] text-green-700">
                  <Icon name="check" size={15} />
                  Wijzigingen opgeslagen.
                </p>
              )}
              <button
                type="button"
                onClick={() => setSaved(true)}
                className="mt-6 flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-accent px-6 font-display text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
              >
                <Icon name="save" size={16} />
                Wijzigingen opslaan
              </button>
            </div>
          </section>
        )}

        {sectie === "addresses" && (
          <section>
            <PageHeader title="Opgeslagen adressen" sub="Snel selecteren bij uw volgende boeking" />
            <div className="grid gap-4 sm:grid-cols-2">
              {ADRESSEN.map((a) => (
                <div key={a.label} className={`${cardCls} flex items-center gap-4 p-5`}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-accent/5 text-accent">
                    <Icon name={a.icon} size={20} />
                  </span>
                  <div>
                    <p className="text-xs text-secondary">{a.label}</p>
                    <p className="mt-0.5 text-[15px] text-ink">{a.adres}</p>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="flex min-h-[84px] items-center justify-center gap-2.5 rounded-card border border-dashed border-line-strong text-sm text-secondary opacity-70 transition-opacity hover:opacity-100"
              >
                <Icon name="plus" size={20} className="text-accent" />
                Adres toevoegen
              </button>
            </div>
          </section>
        )}

        {sectie === "invoices" && (
          <section>
            <PageHeader title="Facturen" sub="Download uw ritfacturen" />
            <div className={cardCls}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
                    {["Factuurnr.", "Datum", "Omschrijving", "Bedrag", "Download"].map((h) => (
                      <th key={h} className="px-5 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FACTUREN.map((f) => (
                    <tr key={f.nr} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-3 text-ink">{f.nr}</td>
                      <td className="px-5 py-3 text-secondary">{f.datum}</td>
                      <td className="px-5 py-3 text-secondary">{f.omschrijving}</td>
                      <td className="px-5 py-3 font-semibold text-ink">{f.bedrag}</td>
                      <td className="px-5 py-3">
                        <button type="button" className="flex items-center gap-1.5 rounded-md border border-line bg-accent/5 px-3 py-1.5 text-xs text-accent hover:bg-accent/10">
                          <Icon name="download" size={13} />
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function RidesTable({ rows, compact = false }: { rows: typeof RITTEN; compact?: boolean }) {
  return (
    <div className={cardCls}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
              <th className="px-5 py-3 font-medium">Datum</th>
              <th className="px-5 py-3 font-medium">Van → Naar</th>
              {!compact && <th className="px-5 py-3 font-medium">Chauffeur</th>}
              <th className="px-5 py-3 font-medium">Voertuig</th>
              <th className="px-5 py-3 font-medium">Bedrag</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.datum}-${r.route}`} className="border-b border-line/60 last:border-0">
                <td className="px-5 py-3 text-secondary">{r.datum}</td>
                <td className="px-5 py-3 text-ink">{r.route}</td>
                {!compact && <td className="px-5 py-3 text-secondary">{r.chauffeur}</td>}
                <td className="px-5 py-3 text-secondary">{r.voertuig}</td>
                <td className="px-5 py-3 font-semibold text-ink">{r.bedrag}</td>
                <td className="px-5 py-3"><Status s={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
