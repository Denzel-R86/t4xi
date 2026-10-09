import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import AddressAutocomplete, { type AddressSuggestion } from "@/components/shared/AddressAutocomplete";
import { Link } from "@/i18n/navigation";
import { BOOKING_FIELD_ID, fieldErrorId, type BookingField } from "@/lib/booking/steps";
import type { AddressMeta, RitType } from "@/lib/booking-meta";
import { FieldError, type FieldErrorState } from "./fields";

export type BookableRideType = Extract<RitType, "enkel" | "retour">;

const TABS: { key: BookableRideType; labelKey: "tabEnkel" | "tabRetour" }[] = [
  { key: "enkel", labelKey: "tabEnkel" },
  { key: "retour", labelKey: "tabRetour" },
];

/**
 * AddressAutocomplete (eigen PR #66) kent geen `aria-invalid`-prop; de stap zet
 * de foutstatus daarom op het invoerveld binnen de wrapper. Alleen deze twee
 * attributen — de component zelf beheert ze niet.
 */
function useAddressInvalid(field: BookingField, error: FieldErrorState) {
  const ref = useRef<HTMLDivElement>(null);
  const invalid = error?.field === field;
  useEffect(() => {
    const input = ref.current?.querySelector("input");
    if (!input) return;
    if (invalid) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", fieldErrorId(field));
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }, [field, invalid]);
  return ref;
}

/** Stap 1 — Route: ritsoort en adressen, met de herkende adresgegevens. */
export default function RouteStep({
  tab,
  onTab,
  onPickup,
  onDropoff,
  initialPickup,
  initialDropoff,
  meta,
  error,
}: {
  tab: BookableRideType;
  onTab: (tab: BookableRideType) => void;
  onPickup: (s: AddressSuggestion | null) => void;
  onDropoff: (s: AddressSuggestion | null) => void;
  initialPickup?: string;
  initialDropoff?: string;
  meta: AddressMeta | null;
  error: FieldErrorState;
}) {
  const t = useTranslations("booking");
  const pickupRef = useAddressInvalid("pickup", error);
  const dropoffRef = useAddressInvalid("dropoff", error);

  return (
    <>
      {/* Ritsoort: luchthaven is geen los type maar wordt uit de adressen herkend.
          Dagtochten hebben een eigen aanvraagflow en horen niet in een transferformulier. */}
      <fieldset className="mb-5">
        <legend className="sr-only">{t("ritType")}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("ritType")}>
          {TABS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={tab === x.key}
              onClick={() => onTab(x.key)}
              className={`min-h-11 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === x.key
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-[#F4F1EB] text-[#4E565E] hover:text-ink"
              }`}
            >
              {t(x.labelKey)}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-secondary">
          {t("airportHint")} {" "}
          <Link href="/dagtochten#aanvragen" className="inline-flex min-h-6 items-center font-medium text-accent underline underline-offset-2">
            {t("dayTripLink")}
          </Link>
        </p>
      </fieldset>

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
        <div id={BOOKING_FIELD_ID.pickup} ref={pickupRef} className="min-w-0">
          <AddressAutocomplete label={t("van")} placeholder={t("vertrekadresPh")} onSelect={onPickup} initialValue={initialPickup} autoCompleteSection="booking-pickup" />
          <FieldError field="pickup" error={error} />
        </div>
        <div id={BOOKING_FIELD_ID.dropoff} ref={dropoffRef} className="min-w-0">
          <AddressAutocomplete label={t("naar")} placeholder={t("bestemmingPh")} onSelect={onDropoff} initialValue={initialDropoff} autoCompleteSection="booking-dropoff" />
          <FieldError field="dropoff" error={error} />
        </div>
      </div>

      {/* Adresdetectie */}
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3" aria-label={t("adresDetectie")}>
        {[
          { key: t("postcode"), value: meta?.postcode },
          { key: t("stad"), value: meta?.city },
          { key: t("stadsdeel"), value: meta?.district },
        ].map((pill) => (
          <div key={pill.key} className="rounded-xl border border-line bg-fog px-3 py-2.5">
            <small className="block text-[10px] uppercase tracking-[0.12em] text-stone">{pill.key}</small>
            <b className={`block truncate text-[13px] ${pill.value && pill.value !== "—" ? "text-accent" : "font-semibold text-stone"}`}>
              {pill.value ?? "—"}
            </b>
          </div>
        ))}
      </div>
    </>
  );
}
