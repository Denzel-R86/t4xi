"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";

const FAQS = [
  {
    q: "Hoe boek ik een taxi?",
    a: "Via het formulier op deze pagina, WhatsApp of telefonisch. Bevestiging binnen 5 minuten.",
  },
  {
    q: "Rijdt T4XI naar Schiphol?",
    a: "Absoluut. Wij monitoren vluchttijden en passen de ophaaltijd aan bij vertraging. Beschikbaar vanuit Amsterdam en Rotterdam.",
  },
  {
    q: "Welke voertuigen heeft T4XI?",
    a: "In Amsterdam: Lynk & Co 01 (Plug-in Hybrid SUV) en Tesla Model Y (elektrisch). In Rotterdam: Tesla Model Y. Alle voertuigen zijn nieuw en luxe ingericht.",
  },
  {
    q: "Hoe betaal ik?",
    a: "Via iDEAL (vooraf), pin in de auto of contant. Zakelijke factuur per maand is ook mogelijk.",
  },
  {
    q: "Wat zijn de dagtochten?",
    a: "T4XI biedt toeristische dagtochten vanuit Amsterdam en Rotterdam naar bestemmingen in België, Nederland, Duitsland en Luxemburg — o.a. Brugge, Keulen, Gent en Luxemburg-Stad.",
  },
];

/** FAQ-accordeon uit het v14-bronbestand. */
export default function FaqList() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {FAQS.map((faq, i) => (
        <div key={faq.q} className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
          <button
            type="button"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-ink transition-colors hover:bg-fog"
          >
            {faq.q}
            <Icon
              name="chevron-down"
              size={17}
              className={`shrink-0 text-stone transition-transform duration-300 ${open === i ? "rotate-180" : ""}`}
            />
          </button>
          {open === i && (
            <p className="border-t border-line px-5 py-4 text-sm leading-relaxed text-secondary">
              {faq.a}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
