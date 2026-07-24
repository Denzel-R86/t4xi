"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Appearance, StripePaymentElementOptions } from "@stripe/stripe-js";
import { useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";
import { getStripe } from "@/lib/payments/stripe-client";
import {
  buildCreateIntentBody,
  newAttempt,
  mapCreateIntentError,
  mapStripeError,
  paymentReducer,
  initialPaymentState,
  canSubmitPayment,
  isBusy,
  elementsLocale,
  formatAmount,
  type PaymentRide,
  type PaymentErrorKey,
} from "@/lib/payments/payment-flow";

/**
 * Betaalstap met Stripe Payment Element (stap 7.3).
 *
 * Kleinste integratiepunt: verschijnt in BookingSection nadat een boeking met een
 * vaste prijs is aangemaakt. De prijsautoriteit blijft server-side — het bedrag
 * komt uit de create-intent-respons, niet uit clientdata. Na `confirmPayment`
 * claimt de UI GEEN definitieve bevestiging (webhook volgt in stap 7.4).
 */

const APPEARANCE: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#28313B",
    colorText: "#1F2730",
    colorDanger: "#DC2626",
    borderRadius: "10px",
    fontFamily: "Inter, Arial, sans-serif",
    spacingUnit: "4px",
  },
};

const PE_OPTIONS: StripePaymentElementOptions = { layout: "tabs" };

export default function PaymentStep({ ride }: { ride: PaymentRide }) {
  const t = useTranslations("betaling");
  const [state, dispatch] = useReducer(paymentReducer, initialPaymentState);
  // Eén Stripe-promise per component-instantie; loadStripe zelf is al gememoïseerd.
  // .catch voorkomt een unhandled rejection wanneer de key in dev ontbreekt.
  const stripePromise = useMemo(() => getStripe().catch(() => null), []);
  const startedRef = useRef(false);

  async function startIntent() {
    dispatch({ type: "createStart" });
    const attempt = newAttempt(); // nieuwe UUID per (her)start van de poging
    try {
      const res = await fetch("/api/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateIntentBody(ride, attempt)),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.clientSecret === "string") {
        dispatch({
          type: "createSuccess",
          intent: {
            clientSecret: data.clientSecret,
            paymentIntentId: String(data.paymentIntentId ?? ""),
            amount: Number(data.amount),
            currency: String(data.currency ?? "eur"),
          },
        });
      } else {
        const key = mapCreateIntentError(res.status);
        dispatch({ type: "createError", kind: res.status === 503 ? "config" : "api", messageKey: key });
      }
    } catch {
      dispatch({ type: "createError", kind: "api", messageKey: "startFailed" });
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startIntent();
    // ride is stabiel voor deze boeking; bewust één keer starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    startedRef.current = true;
    void startIntent();
  }

  // ── render ───────────────────────────────────────────────────────────────
  if (state.status === "pending") {
    return (
      <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-5 py-4 text-center text-sm text-green-700" role="status" aria-live="polite">
        <div className="flex items-center justify-center gap-2 font-semibold">
          <Icon name="check" size={16} />
          {t("pendingKop")}
        </div>
        <p className="mt-1 text-green-700/90">{t("pending")}</p>
      </div>
    );
  }

  if (state.status === "creatingIntent") {
    return (
      <div className="rounded-2xl border border-line bg-fog px-5 py-6 text-center text-sm text-secondary" role="status" aria-live="polite" aria-busy="true">
        {t("formulierLaden")}
      </div>
    );
  }

  // Fout zonder intent (create-intent mislukt) → melding + opnieuw proberen.
  if (!state.intent) {
    return (
      <div className="rounded-2xl border border-line bg-card p-5">
        <ErrorBanner t={t} messageKey={state.error?.messageKey ?? "startFailed"} />
        <button
          type="button"
          onClick={retry}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line-strong bg-white/60 text-sm font-medium text-ink transition-colors hover:bg-white"
        >
          {t("opnieuw")}
        </button>
      </div>
    );
  }

  const amountLabel = formatAmount(state.intent.amount, state.intent.currency, ride.locale);

  return (
    <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="betaling-kop">
      <h3 id="betaling-kop" className="mb-3 font-display text-base font-semibold text-ink">
        {t("kop")}
      </h3>
      {/* Overzicht — presentatie van het autoritatieve serverbedrag (geen prijsautoriteit). */}
      <dl className="mb-4 grid gap-1.5 text-sm">
        <Row label={t("route")} value={`${ride.pickup} → ${ride.dropoff}`} />
        <Row label={t("ritType")} value={ride.returnTrip ? t("retour") : t("enkeleRit")} />
        <Row label={t("passagiers")} value={String(ride.passengers)} />
        <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
          <dt className="text-xs uppercase tracking-wide text-stone">{t("teBetalen")}</dt>
          <dd className="font-display text-xl font-bold text-accent">{amountLabel}</dd>
        </div>
      </dl>

      <Elements
        stripe={stripePromise}
        options={{ clientSecret: state.intent.clientSecret, appearance: APPEARANCE, locale: elementsLocale(ride.locale) }}
      >
        <PayForm
          t={t}
          busy={isBusy(state)}
          canSubmit={canSubmitPayment(state)}
          stripeError={state.error?.kind === "stripe" ? state.error.messageKey : null}
          onConfirmStart={() => dispatch({ type: "confirmStart" })}
          onConfirmError={(key) => dispatch({ type: "confirmError", messageKey: key })}
          onRequiresAction={() => dispatch({ type: "requiresAction" })}
          onPending={() => dispatch({ type: "confirmPending" })}
        />
      </Elements>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-secondary">{label}</dt>
      <dd className="truncate text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function ErrorBanner({ t, messageKey }: { t: (k: string) => string; messageKey: PaymentErrorKey }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600" role="alert" aria-live="assertive">
      <Icon name="phone" size={15} />
      {t(messageKey)}
    </p>
  );
}

/**
 * Betaalformulier binnen <Elements>. Gebruikt uitsluitend het Stripe-hosted
 * PaymentElement; er worden nooit losse kaartvelden gebouwd of gelezen.
 */
function PayForm({
  t,
  busy,
  canSubmit,
  stripeError,
  onConfirmStart,
  onConfirmError,
  onRequiresAction,
  onPending,
}: {
  t: (k: string) => string;
  busy: boolean;
  canSubmit: boolean;
  stripeError: PaymentErrorKey | null;
  onConfirmStart: () => void;
  onConfirmError: (key: PaymentErrorKey) => void;
  onRequiresAction: () => void;
  onPending: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy || !canSubmit) return; // dubbelklik/dubbel-submit
    onConfirmStart();

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}${window.location.pathname}` },
      // Card-betalingen blijven in-page; alleen methoden die dit vereisen redirecten.
      redirect: "if_required",
    });

    if (error) {
      onConfirmError(mapStripeError(error.type));
      return;
    }
    if (paymentIntent?.status === "requires_action") {
      onRequiresAction();
      return;
    }
    // succeeded | processing | requires_capture, of teruggekeerd zonder fout:
    // neutrale "in behandeling"-status. GEEN definitieve bevestiging (stap 7.4).
    onPending();
  }

  return (
    <form onSubmit={handlePay} noValidate>
      <PaymentElement options={PE_OPTIONS} />

      {stripeError && (
        <p className="mt-3 text-sm text-red-600" role="alert" aria-live="assertive">
          {t(stripeError)} {t("opnieuwZin")}
        </p>
      )}

      {busy && (
        <p className="mt-3 text-center text-sm text-secondary" role="status" aria-live="polite">
          {t("verwerkt")}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || !canSubmit || busy}
        aria-busy={busy}
        className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
      >
        <Icon name="lock" size={17} />
        {busy ? t("bezig") : t("betaalKnop")}
      </button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] text-secondary">
        <Icon name="shield-check" size={13} className="text-accent" />
        {t("beveiligd")}
      </p>
    </form>
  );
}
