"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";

/**
 * T4XI Control sign-in — individual identity, then AAL2 before anything else.
 *
 * The server (authorizeControl) is the authority: it re-checks the user, the
 * assurance level and the permission on every render. This component only
 * walks the user to a session the server will accept, and never decides
 * access itself.
 *
 * Steps: password → (enrol TOTP | answer a challenge) → verify → reload.
 * There is no bypass: the AAL2 requirement lives server-side, and
 * CONTROL_REQUIRE_AAL2 is local-development only.
 */

type Step = "signin" | "resolving" | "enroll" | "challenge" | "forbidden";
const FRIENDLY_NAME = "T4XI Control TOTP";

export default function ControlLogin({ reason }: { reason?: string }) {
  const supabase = useRef(createClient()).current;
  const [step, setStep] = useState<Step>(
    reason === "forbidden" ? "forbidden" : reason === "mfa_required" ? "resolving" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  /** Ask for a fresh challenge. TOTP challenges expire, so this is repeatable. */
  const startChallenge = useCallback(
    async (id: string) => {
      const { data, error } = await supabase.auth.mfa.challenge({ factorId: id });
      if (error || !data) {
        setMessage("Kon geen verificatie starten. Probeer het opnieuw.");
        setChallengeId(null);
        return;
      }
      setChallengeId(data.id);
    },
    [supabase],
  );

  /**
   * Decide what this session still needs. AAL2 → the server will let us in.
   * A verified factor → answer a challenge. Otherwise → enrol one.
   */
  const routeByAssurance = useCallback(async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setBusy(true);
    try {
      if (aal?.currentLevel === "aal2") {
        window.location.reload();
        return;
      }

      const { data: factors, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setMessage("Kon de tweede factor niet uitlezen. Probeer opnieuw in te loggen.");
        setStep("signin");
        return;
      }

      const totp = factors?.totp ?? [];
      const verified = totp.find((factor) => factor.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setStep("challenge");
        setMessage("Voer de zescijferige code uit je authenticator-app in.");
        await startChallenge(verified.id);
        return;
      }

      // Leftovers from an abandoned enrolment would block a new one; clear them.
      for (const stale of totp.filter((factor) => factor.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }

      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: FRIENDLY_NAME,
      });
      if (enrollError || !enrolled) {
        setMessage("Inschrijven van de tweede factor is mislukt. Probeer het opnieuw.");
        setStep("signin");
        return;
      }
      setFactorId(enrolled.id);
      setQr(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setStep("enroll");
      setMessage("Scan de code en bevestig met de zescijferige code uit je app.");
    } finally {
      setBusy(false);
    }
  }, [supabase, startChallenge]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("Bezig met aanmelden…");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage("Aanmelden mislukt.");
        return;
      }
      setPassword("");
      await routeByAssurance();
    } catch {
      setMessage("Control-authenticatie is nog niet geconfigureerd.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setMessage("Bezig met verifiëren…");
    try {
      let active = challengeId;
      if (!active) {
        const { data, error } = await supabase.auth.mfa.challenge({ factorId });
        if (error || !data) {
          setMessage("Kon geen verificatie starten. Probeer het opnieuw.");
          return;
        }
        active = data.id;
        setChallengeId(active);
      }

      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: active,
        code: code.trim(),
      });
      if (error) {
        setCode("");
        if (/expire/i.test(error.message)) {
          setChallengeId(null);
          setMessage("De verificatie is verlopen. Vraag een nieuwe aan en voer een verse code in.");
        } else {
          setMessage("Verificatie mislukt. Controleer de code en probeer opnieuw.");
        }
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  const card =
    "mx-auto mt-20 max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm";
  const heading = (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">T4XI Control</p>
      <h1 className="mt-2 text-2xl font-semibold">
        {step === "signin" && "Individueel aanmelden"}
        {step === "resolving" && "Tweede factor vereist"}
        {step === "enroll" && "Tweede factor instellen"}
        {step === "challenge" && "Tweede factor bevestigen"}
        {step === "forbidden" && "Geen toegang"}
      </h1>
    </div>
  );

  if (step === "forbidden") {
    return (
      <div className={card}>
        {heading}
        <p className="text-sm text-slate-600">
          Je bent aangemeld en je tweede factor is bevestigd, maar dit account heeft geen
          Control-permissie. Een beheerder moet een rol toekennen.
        </p>
        <button onClick={signOut} className="w-full rounded-lg border px-4 py-3 font-medium" type="button">
          Afmelden
        </button>
      </div>
    );
  }

  // The server established that this session is authenticated but only AAL1.
  // Setting up or answering a second factor is a deliberate act, so it starts
  // with a click rather than on render.
  if (step === "resolving") {
    return (
      <div className={card}>
        {heading}
        <p className="text-sm text-slate-600">
          Je bent aangemeld, maar Control vereist een tweede factor. Ga verder om je
          authenticator in te stellen of een code te bevestigen.
        </p>
        <button
          onClick={() => void routeByAssurance()}
          className="w-full rounded-lg bg-slate-950 px-4 py-3 font-medium text-white disabled:opacity-50"
          type="button"
          disabled={busy}
        >
          Verdergaan
        </button>
        <p aria-live="polite" className="min-h-5 text-sm text-slate-600">
          {message}
        </p>
        <button onClick={signOut} className="w-full text-xs text-slate-500 underline" type="button">
          Afmelden
        </button>
      </div>
    );
  }

  if (step === "enroll" || step === "challenge") {
    return (
      <form onSubmit={verify} className={card}>
        {heading}
        {step === "enroll" && qr && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR-code voor je authenticator-app" className="mx-auto h-44 w-44" />
            <p className="break-all rounded-lg bg-slate-50 p-2 text-center font-mono text-xs text-slate-700">
              {secret}
            </p>
            <p className="text-xs text-slate-500">
              Scan de code, of voer de sleutel handmatig in. Bewaar hem niet buiten je
              authenticator-app.
            </p>
          </div>
        )}
        <label className="block text-sm">
          Verificatiecode
          <input
            className="mt-1 w-full rounded-lg border p-3 text-center font-mono tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
        </label>
        <button
          className="w-full rounded-lg bg-slate-950 px-4 py-3 font-medium text-white disabled:opacity-50"
          type="submit"
          disabled={busy || code.length !== 6}
        >
          Bevestigen
        </button>
        {step === "challenge" && (
          <button
            type="button"
            onClick={() => factorId && startChallenge(factorId)}
            className="w-full text-xs text-slate-500 underline"
            disabled={busy}
          >
            Nieuwe verificatie aanvragen
          </button>
        )}
        <p aria-live="polite" className="min-h-5 text-sm text-slate-600">
          {message}
        </p>
        <button onClick={signOut} className="w-full text-xs text-slate-500 underline" type="button">
          Afmelden
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={signIn} className={card}>
      {heading}
      <label className="block text-sm">
        E-mail
        <input
          className="mt-1 w-full rounded-lg border p-3"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        Wachtwoord
        <input
          className="mt-1 w-full rounded-lg border p-3"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button
        className="w-full rounded-lg bg-slate-950 px-4 py-3 font-medium text-white disabled:opacity-50"
        type="submit"
        disabled={busy}
      >
        Aanmelden
      </button>
      <p aria-live="polite" className="min-h-5 text-sm text-slate-600">
        {message}
      </p>
      <p className="text-xs text-slate-500">
        MFA en een expliciete Control-permission zijn verplicht. De bestaande operations-login
        blijft tijdelijk op zijn huidige routes beschikbaar.
      </p>
    </form>
  );
}
