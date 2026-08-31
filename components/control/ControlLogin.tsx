"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function ControlLogin({ reason }: { reason?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(reason === "mfa_required" ? "Rond eerst MFA af in je account." : "");

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Bezig met aanmelden…");
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) return setMessage("Aanmelden mislukt.");
      window.location.reload();
    } catch {
      setMessage("Control-authenticatie is nog niet geconfigureerd.");
    }
  }

  return (
    <form onSubmit={signIn} className="mx-auto mt-20 max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">T4XI Control</p>
        <h1 className="mt-2 text-2xl font-semibold">Individueel aanmelden</h1>
      </div>
      <label className="block text-sm">E-mail<input className="mt-1 w-full rounded-lg border p-3" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="block text-sm">Wachtwoord<input className="mt-1 w-full rounded-lg border p-3" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button className="w-full rounded-lg bg-slate-950 px-4 py-3 font-medium text-white" type="submit">Aanmelden</button>
      <p aria-live="polite" className="min-h-5 text-sm text-slate-600">{message}</p>
      <p className="text-xs text-slate-500">MFA en een expliciete Control-permission zijn verplicht. De bestaande operations-login blijft tijdelijk op zijn huidige routes beschikbaar.</p>
    </form>
  );
}
