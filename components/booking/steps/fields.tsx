import type { ComponentPropsWithoutRef } from "react";
import Icon from "@/components/ui/Icon";
import { fieldErrorId, type BookingField } from "@/lib/booking/steps";

/**
 * Gedeelde veldbouwstenen voor de boekingsstappen (PR 2.4).
 * Radius `rounded-field` (14px), geen nieuwe tokens (design-system README §1.5).
 */

/** Ongeldig veld: rode rand via `aria-invalid` — de markering volgt de a11y-state. */
export const inputCls =
  "min-h-[52px] w-full min-w-0 rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none aria-[invalid=true]:border-red-600";

/**
 * F-26: iOS Safari geeft native date/time-inputs een eigen intrinsieke breedte,
 * waardoor ze rechts buiten de kolom lopen. `appearance:none` + `min-width:0`
 * laat ze de kolombreedte volgen; de waarde links uitlijnen zoals de andere velden.
 */
// `appearance:none` haalt in WebKit de verticale centrering weg: regelhoogte = veldhoogte minus rand.
export const dateTimeCls = `${inputCls} block h-[52px] appearance-none leading-[50px] [-webkit-appearance:none] [&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:text-left`;

/**
 * F-26 / 2.6b: WebKit negeert `min-height` op een native <select> (gemeten: 24px
 * in WebKit iPhone 13). Een vaste hoogte van 52px geldt op alle breedtes; onder
 * 768px bovendien `appearance:none` met een eigen pijl uit Icon.tsx, zodat iOS
 * het veld niet zelf vormgeeft. Vanaf 768px blijft de native pijl staan.
 * De native keuzelijst opent zoals altijd.
 */
export const selectCls = `${inputCls} h-[52px] max-md:block max-md:appearance-none max-md:pr-11 max-md:[-webkit-appearance:none]`;

/** Native <select> met de gedeelde veldstijl en (onder 768px) een eigen pijl. */
export function SelectField(props: Omit<ComponentPropsWithoutRef<"select">, "className">) {
  return (
    <div className="relative">
      <select {...props} className={selectCls} />
      <Icon name="chevron-down" size={18} className="pointer-events-none absolute right-4 top-[17px] text-ink md:hidden" />
    </div>
  );
}

export const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

/** Verplicht-markering: visueel `*`; schermlezers lezen `required` van het veld zelf. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-accent">
      {" "}*
    </span>
  );
}

export type FieldErrorState = { field: BookingField; message: string } | null;

/** a11y-attributen voor een veld: `aria-invalid` + koppeling naar de foutmelding. */
export function fieldA11y(field: BookingField, error: FieldErrorState, describedBy?: string) {
  const invalid = error?.field === field;
  const ids = [describedBy, invalid ? fieldErrorId(field) : undefined].filter(Boolean).join(" ");
  return {
    "aria-invalid": invalid || undefined,
    "aria-describedby": ids || undefined,
  } as const;
}

/** Foutmelding direct onder het veld; gekoppeld via `aria-describedby`. */
export function FieldError({ field, error }: { field: BookingField; error: FieldErrorState }) {
  if (error?.field !== field) return null;
  return (
    <p id={fieldErrorId(field)} className="mt-1.5 text-[12px] font-medium text-red-700">
      {error.message}
    </p>
  );
}
