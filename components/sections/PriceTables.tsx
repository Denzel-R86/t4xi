"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";

type Row = { icon: string; dest: string; km: string; single: string; retour: string; highlight?: boolean };
type Group = { header: string; rows: Row[] };

const AMS: Group[] = [
  {
    header: "Luchthavens",
    rows: [
      { icon: "plane", dest: "Schiphol Airport", km: "~22 km", single: "€69", retour: "€124", highlight: true },
      { icon: "plane", dest: "Rotterdam Airport", km: "~85 km", single: "€119", retour: "€214" },
    ],
  },
  {
    header: "Intercity",
    rows: [
      { icon: "map-pin", dest: "Rotterdam", km: "~78 km", single: "€109", retour: "€196" },
      { icon: "map-pin", dest: "Den Haag", km: "~65 km", single: "€85", retour: "€153" },
      { icon: "map-pin", dest: "Utrecht", km: "~40 km", single: "€69", retour: "€124" },
      { icon: "map-pin", dest: "Eindhoven", km: "~120 km", single: "€139", retour: "€250" },
    ],
  },
  {
    header: "Dagtochten Benelux (all-in)",
    rows: [
      { icon: "flag", dest: "Antwerpen 🇧🇪", km: "~155 km", single: "€495", retour: "—" },
      { icon: "flag", dest: "Brussel 🇧🇪", km: "~210 km", single: "€625", retour: "—" },
      { icon: "flag", dest: "Brugge 🇧🇪", km: "~230 km", single: "€695", retour: "—" },
      { icon: "flag", dest: "Düsseldorf 🇩🇪", km: "~215 km", single: "€695", retour: "—" },
      { icon: "flag", dest: "Keulen 🇩🇪", km: "~230 km", single: "€695", retour: "—" },
      { icon: "flag", dest: "Luxemburg 🇱🇺", km: "~340 km", single: "€1.095", retour: "—" },
      { icon: "flag", dest: "Parijs 🇫🇷", km: "~500 km", single: "Op aanvraag", retour: "—" },
    ],
  },
];

const ROT: Group[] = [
  {
    header: "Luchthavens",
    rows: [
      { icon: "plane", dest: "Schiphol Airport", km: "~80 km", single: "€119", retour: "€214", highlight: true },
      { icon: "plane", dest: "Rotterdam Airport", km: "~12 km", single: "€39", retour: "€70", highlight: true },
    ],
  },
  {
    header: "Intercity",
    rows: [
      { icon: "map-pin", dest: "Amsterdam", km: "~78 km", single: "€109", retour: "€196" },
      { icon: "map-pin", dest: "Den Haag", km: "~25 km", single: "€49", retour: "€88" },
      { icon: "map-pin", dest: "Utrecht", km: "~55 km", single: "€79", retour: "€142" },
    ],
  },
  {
    header: "Dagtochten Benelux (all-in)",
    rows: [
      { icon: "flag", dest: "Antwerpen 🇧🇪", km: "~75 km", single: "€425", retour: "—" },
      { icon: "flag", dest: "Brussel 🇧🇪", km: "~165 km", single: "€575", retour: "—" },
      { icon: "flag", dest: "Brugge 🇧🇪", km: "~155 km", single: "€625", retour: "—" },
    ],
  },
];

const OVE: Group[] = [
  {
    header: "Almere → Schiphol · prijs per stadsdeel",
    rows: [
      { icon: "plane", dest: "Almere Poort", km: "~39 km", single: "€102", retour: "€184", highlight: true },
      { icon: "plane", dest: "Almere Stad Centrum", km: "~40 km", single: "€104", retour: "€187" },
      { icon: "plane", dest: "Almere Haven", km: "~40 km", single: "€103", retour: "€185" },
      { icon: "plane", dest: "Almere Muziekwijk", km: "~41 km", single: "€105", retour: "€189" },
      { icon: "plane", dest: "Almere Buiten", km: "~44 km", single: "€110", retour: "€198" },
      { icon: "plane", dest: "Almere Hout", km: "~45 km", single: "€113", retour: "€203" },
      { icon: "plane", dest: "Almere Oostvaarders", km: "~47 km", single: "€116", retour: "€209" },
    ],
  },
  {
    header: "Amsterdam → Schiphol · prijs per wijk",
    rows: [
      { icon: "plane", dest: "Amsterdam Zuidas", km: "~10 km", single: "€50", retour: "€90", highlight: true },
      { icon: "plane", dest: "Amsterdam Centrum", km: "~14 km", single: "€57", retour: "€103" },
      { icon: "plane", dest: "Amsterdam Oud-Zuid / De Pijp", km: "~13 km", single: "€55", retour: "€99" },
      { icon: "plane", dest: "Amsterdam Oost", km: "~16 km", single: "€60", retour: "€108" },
      { icon: "plane", dest: "Amsterdam Zuidoost / Bijlmer", km: "~16 km", single: "€60", retour: "€108" },
      { icon: "plane", dest: "Amsterdam Noord", km: "~20 km", single: "€65", retour: "€117" },
    ],
  },
  {
    header: "Utrecht → Schiphol · prijs per wijk",
    rows: [
      { icon: "plane", dest: "Leidsche Rijn", km: "~40 km", single: "€104", retour: "€187", highlight: true },
      { icon: "plane", dest: "Utrecht Centrum", km: "~44 km", single: "€110", retour: "€198" },
      { icon: "plane", dest: "De Uithof / Science Park", km: "~48 km", single: "€117", retour: "€211" },
    ],
  },
  {
    header: "Intercity ritten",
    rows: [
      { icon: "map-pin", dest: "Almere → Amsterdam", km: "~35 km", single: "€45", retour: "€81" },
      { icon: "map-pin", dest: "Almere → Utrecht", km: "~42 km", single: "€65", retour: "€117" },
      { icon: "map-pin", dest: "Utrecht → Amsterdam", km: "~40 km", single: "€69", retour: "€124" },
      { icon: "map-pin", dest: "Den Haag → Schiphol", km: "~43 km", single: "€107", retour: "€193" },
    ],
  },
];

const TABS = [
  { key: "ams", label: "Vanuit Amsterdam", groups: AMS, ariaLabel: "Prijzen vanuit Amsterdam" },
  { key: "rot", label: "Vanuit Rotterdam", groups: ROT, ariaLabel: "Prijzen vanuit Rotterdam" },
  { key: "ove", label: "Almere / Utrecht", groups: OVE, ariaLabel: "Prijzen per stadsdeel vanuit Almere, Utrecht en Den Haag" },
];

/** Prijstabellen met tabs — 1-op-1 uit het v14-bronbestand (#prijzen). */
export default function PriceTables() {
  const [active, setActive] = useState("ams");
  const tab = TABS.find((t) => t.key === active)!;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
      <div className="flex flex-wrap gap-2 border-b border-line p-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={active === t.key}
            onClick={() => setActive(t.key)}
            className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              active === t.key
                ? "border-accent bg-accent text-white"
                : "border-line bg-[#F4F1EB] text-[#4E565E] hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={tab.ariaLabel}>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
              <th className="px-5 py-3 font-medium">{active === "ove" ? "Van (stadsdeel) → Schiphol" : "Bestemming"}</th>
              <th className="px-5 py-3 font-medium">Afstand</th>
              <th className="px-5 py-3 font-medium">Enkele rit</th>
              <th className="px-5 py-3 font-medium">Retour</th>
            </tr>
          </thead>
          <tbody>
            {tab.groups.map((group) => (
              <SectionRows key={group.header} group={group} />
            ))}
          </tbody>
        </table>
      </div>

      {active === "ove" && (
        <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-xs text-secondary">
          <Icon name="info-circle" size={14} className="mt-0.5 shrink-0 text-accent" />
          Prijzen worden berekend op basis van uw exacte vertrekadres. Gebruik de
          boekingscalculator voor uw specifieke stadsdeel.
        </p>
      )}

      <p className="flex items-start gap-2 border-t border-line px-5 py-4 text-xs leading-relaxed text-secondary">
        <Icon name="info-circle" size={14} className="mt-0.5 shrink-0 text-stone" />
        <span>
          Staat uw route er niet bij? Bel of WhatsApp ons voor een vaste offerte.
          Alle tarieven zijn inclusief btw. Nachttarief (23:00–06:00) +15%.
          Maximaal 4 passagiers exclusief chauffeur. Adviesbagage: 2 grote koffers
          + 2 handbagage bij 4 passagiers, of 3 grote koffers bij maximaal 3 passagiers.
        </span>
      </p>
    </div>
  );
}

function SectionRows({ group }: { group: Group }) {
  return (
    <>
      <tr>
        <td colSpan={4} className="px-5 pb-1.5 pt-4 text-[10px] uppercase tracking-[3px] text-stone">
          {group.header}
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr
          key={row.dest}
          className={`border-t border-line/60 ${row.highlight ? "bg-accent/[0.04]" : ""}`}
        >
          <td className="flex items-center gap-2 px-5 py-3 text-ink">
            <Icon name={row.icon} size={15} className="shrink-0 text-accent" />
            {row.dest}
          </td>
          <td className="px-5 py-3 text-secondary">{row.km}</td>
          <td className="px-5 py-3 font-display font-semibold text-accent">{row.single}</td>
          <td className="px-5 py-3 text-secondary">{row.retour}</td>
        </tr>
      ))}
    </>
  );
}
