"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BANNER_VERSION,
  CONSENT_COOKIE_NAME,
  CONSENT_SCHEMA_VERSION,
  hasOptionalTrackers,
} from "@/lib/consent/config";

/**
 * LET OP — dit is géén juridisch bewijs van toestemming, slechts een
 * proportionele lokale vastlegging: de bezoeker kan het cookie zelf
 * verwijderen of wijzigen, en het is niet centraal (bijv. bij een geschil of
 * verzoek van een toezichthouder) op te vragen of te verifiëren. Voor een
 * sterkere, centraal controleerbare aantoonbaarheid van toestemming is een
 * (pseudonieme) server-side consentlog nodig — dat bestaat momenteel niet.
 */
type ConsentRecord = {
  schemaVersion: number;
  bannerVersion: number;
  statistics: boolean;
  marketing: boolean;
  /** ISO-tijdstip van vastlegging, onderdeel van deze lokale registratie (geen juridisch bewijs, zie boven). */
  ts: string;
};

type ConsentState = {
  /** false tot na de eerste client-render, om hydration-mismatch en flits te voorkomen. */
  ready: boolean;
  /** true zodra de bezoeker een geldige keuze heeft vastgelegd vóór de huidige BANNER_VERSION. */
  hasChoice: boolean;
  statistics: boolean;
  marketing: boolean;
  /** Tijdstip van de laatst vastgelegde keuze (lokale registratie, geen juridisch bewijs). Null vóór de eerste keuze. */
  consentedAt: string | null;
  /** Preferences-paneel binnen de banner, apart van de banner-zichtbaarheid zelf. */
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  acceptAll: () => void;
  rejectOptional: () => void;
  savePreferences: (choice: { statistics: boolean; marketing: boolean }) => void;
  /** Heropent de banner, voor de "Cookie-instellingen"-link in de footer. */
  reopen: () => void;
};

const ConsentContext = createContext<ConsentState | null>(null);

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${oneYear}; path=/; SameSite=Lax`;
}

function parseConsent(raw: string | null): ConsentRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    // Een andere schema- of bannerversie is geen geldige keuze voor de huidige
    // situatie: nieuwe leverancier/doel/wijziging vereist opnieuw toestemming.
    if (parsed.schemaVersion !== CONSENT_SCHEMA_VERSION) return null;
    if (parsed.bannerVersion !== BANNER_VERSION) return null;
    if (typeof parsed.ts !== "string") return null;
    return {
      schemaVersion: CONSENT_SCHEMA_VERSION,
      bannerVersion: BANNER_VERSION,
      statistics: Boolean(parsed.statistics),
      marketing: Boolean(parsed.marketing),
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasChoice, setHasChoice] = useState(false);
  const [statistics, setStatistics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [consentedAt, setConsentedAt] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    // Cookie-lezing kan pas ná mount (document is er server-side niet); de
    // setState-calls lopen via een microtask zodat dit geen synchrone
    // setState-in-effect is (react-hooks/set-state-in-effect).
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const stored = parseConsent(readCookie(CONSENT_COOKIE_NAME));
      if (stored) {
        setHasChoice(true);
        setStatistics(stored.statistics);
        setMarketing(stored.marketing);
        setConsentedAt(stored.ts);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((choice: { statistics: boolean; marketing: boolean }) => {
    const ts = new Date().toISOString();
    const record: ConsentRecord = {
      schemaVersion: CONSENT_SCHEMA_VERSION,
      bannerVersion: BANNER_VERSION,
      ...choice,
      ts,
    };
    writeCookie(CONSENT_COOKIE_NAME, JSON.stringify(record));
    setStatistics(choice.statistics);
    setMarketing(choice.marketing);
    setConsentedAt(ts);
    setHasChoice(true);
    setPanelOpen(false);
  }, []);

  const value = useMemo<ConsentState>(
    () => ({
      ready,
      hasChoice,
      statistics,
      marketing,
      consentedAt,
      panelOpen,
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false),
      acceptAll: () => persist({ statistics: true, marketing: true }),
      rejectOptional: () => persist({ statistics: false, marketing: false }),
      savePreferences: persist,
      reopen: () => {
        setHasChoice(false);
        setPanelOpen(false);
      },
    }),
    [ready, hasChoice, statistics, marketing, consentedAt, panelOpen, persist],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentState {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent moet binnen ConsentProvider gebruikt worden");
  return ctx;
}

/** Geen enkele optionele tracker geconfigureerd: banner/instellingen tonen zich niet. */
export const consentFeatureEnabled = hasOptionalTrackers;
