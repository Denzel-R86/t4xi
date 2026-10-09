import { useTranslations } from "next-intl";
import { BOOKING_FIELD_ID } from "@/lib/booking/steps";
import { FieldError, RequiredMark, fieldA11y, inputCls, labelCls, type FieldErrorState } from "./fields";

/**
 * Stap 3 — Gegevens. Bewust ongecontroleerd: `handleSubmit` leest naam,
 * telefoon en e-mail via FormData (`name`-attributen), zoals vóór PR 2.4.
 * Alle drie zijn verplicht (`required` hier, server: route.ts) — dus alle drie
 * dragen het sterretje (F-13).
 */
export default function DetailsStep({ error }: { error: FieldErrorState }) {
  const t = useTranslations("booking");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor={BOOKING_FIELD_ID.name} className={labelCls}>{t("naam")}<RequiredMark /></label>
        <input id={BOOKING_FIELD_ID.name} name="naam" placeholder={t("naamPh")} autoComplete="name" required className={inputCls} {...fieldA11y("name", error)} />
        <FieldError field="name" error={error} />
      </div>
      <div className="min-w-0">
        <label htmlFor={BOOKING_FIELD_ID.phone} className={labelCls}>{t("telefoon")}<RequiredMark /></label>
        <input id={BOOKING_FIELD_ID.phone} name="telefoon" type="tel" placeholder="+31 6 ..." autoComplete="tel" required className={inputCls} {...fieldA11y("phone", error)} />
        <FieldError field="phone" error={error} />
      </div>
      <div className="min-w-0 sm:col-span-2">
        <label htmlFor={BOOKING_FIELD_ID.email} className={labelCls}>{t("email")}<RequiredMark /></label>
        <input id={BOOKING_FIELD_ID.email} name="email" type="email" placeholder={t("emailPh")} autoComplete="email" required className={inputCls} {...fieldA11y("email", error)} />
        <FieldError field="email" error={error} />
      </div>
    </div>
  );
}
