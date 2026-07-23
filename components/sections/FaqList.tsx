"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { useTranslations } from "next-intl";

/** FAQ-accordeon uit het v14-bronbestand; accepteert optioneel eigen vragen. */
export default function FaqList({ items }: { items?: { q: string; a: string }[] }) {
  const t = useTranslations("faq");
  const faqs = items ?? ([1, 2, 3, 4, 5] as const).map((n) => ({ q: t(`v${n}`), a: t(`a${n}`) }));
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {faqs.map((faq, i) => (
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
