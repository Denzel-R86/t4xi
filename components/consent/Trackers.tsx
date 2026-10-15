"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import {
  gaMeasurementId,
  googleAdsId,
  metaPixelId,
  resolveGoogleTrackerActivation,
} from "@/lib/consent/config";
import { useConsent } from "@/components/consent/ConsentContext";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void };
    _fbq?: unknown;
  }
}

/** Cookies per categorie — verwijderd zodra de bijbehorende toestemming wordt ingetrokken. */
const GA_COOKIE_EXACT = ["_ga", "_gid", "_gat"];
const GA_COOKIE_PREFIX = ["_ga_"];
const GOOGLE_ADS_COOKIE_EXACT = ["_gcl_au"];
const GOOGLE_ADS_COOKIE_PREFIX = ["_gac_"];
const META_COOKIE_EXACT = ["_fbp", "_fbc"];

/**
 * Kandidaat-domeinwaarden om een verwijderende Set-Cookie op te proberen. Een
 * cookie kan alleen worden overschreven/verwijderd met een (domain, path) die
 * exact overeenkomt met hoe hij gezet is — dus we proberen alle realistische
 * varianten: geen domain-attribuut (host-only, GA/Meta's gebruikelijke
 * gedrag), de volledige host expliciet, én — omdat GA's "auto"-cookiedomein
 * standaard het geregistreerde domein gebruikt (bv. `.t4xi.nl`, niet
 * `.www.t4xi.nl`) — de ouder-domeinvariant op basis van de laatste twee
 * labels. Dat laatste is een eenvoudige heuristiek (geen echte public-suffix-
 * lijst) die voor t4xi.nl's enkelvoudige .nl-TLD correct is, maar niet
 * algemeen geldig is voor multi-label TLD's zoals .co.uk.
 */
function candidateCookieDomains(host: string): string[] {
  const domains = [host, `.${host}`];
  const labels = host.split(".");
  if (labels.length > 2) {
    const parent = labels.slice(-2).join(".");
    domains.push(`.${parent}`);
  }
  return domains;
}

function deleteCookiesMatching(exact: string[], prefixes: string[]) {
  const names = document.cookie
    .split(";")
    .map((c) => c.trim().split("=")[0])
    .filter(Boolean);
  const host = window.location.hostname;
  const domains = candidateCookieDomains(host);
  for (const name of names) {
    const matches = exact.includes(name) || prefixes.some((p) => name.startsWith(p));
    if (!matches) continue;
    document.cookie = `${name}=; max-age=0; path=/`;
    for (const domain of domains) {
      document.cookie = `${name}=; max-age=0; path=/; domain=${domain}`;
    }
  }
}

/**
 * Google Consent Mode v2 + Meta Pixel, uitsluitend "Basic"-implementatie:
 * er wordt GEEN enkel script geladen vóórdat de bezoeker een keuze heeft
 * gemaakt — dus geen requests, cookies of consent-pings vóór toestemming.
 *
 * Zodra een categorie voor het eerst wordt toegestaan, laadt het bijbehorende
 * script ÉÉN keer (en blijft daarna geladen — ook bij een latere intrekking).
 * Iedere wijziging van de toestemming, inclusief intrekking, wordt direct
 * doorgegeven via `gtag('consent','update', …)` en `fbq('consent', …)` — dit
 * is het door Google/Meta gedocumenteerde mechanisme om metingen te stoppen
 * zonder de pagina te herladen. Bij intrekking worden bovendien de eigen
 * cookies van de tracker opgeruimd.
 *
 * BEPERKING: dit stopt uitsluitend TOEKOMSTIGE verwerking. Gegevens die vóór
 * de intrekking al naar Google/Meta zijn verzonden, worden hierdoor niet
 * met terugwerkende kracht verwijderd bij die partijen — dat vereist een
 * apart verzoek bij de betreffende verwerker.
 */
export default function Trackers() {
  const { ready, hasChoice, statistics, marketing } = useConsent();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [googleTagSrcId, setGoogleTagSrcId] = useState<string | null>(null);
  const [ga4Ready, setGa4Ready] = useState(false);
  const [loadMetaPixel, setLoadMetaPixel] = useState(false);
  const [metaPixelReady, setMetaPixelReady] = useState(false);
  const googleBootstrapped = useRef(false);
  const ga4Initialized = useRef(false);
  const googleAdsInitialized = useRef(false);
  const lastGaPageView = useRef<string | null>(null);
  const lastMetaPageView = useRef<string | null>(null);
  const activation = resolveGoogleTrackerActivation(
    { gaMeasurementId, googleAdsId },
    { statistics, marketing },
  );

  // Eenmalig laden zodra een daadwerkelijk geconfigureerde dienst toestemming
  // heeft in zijn EIGEN categorie. De gtag-queue wordt vooraf klaargezet, zodat
  // initialisatiecommando's veilig wachten tot het externe script gereed is.
  // Bewust GEEN dependency op "false" terug laten leiden tot unmounten: het
  // script blijft staan, alleen de consentstatus verandert (zie effect hieronder).
  // setState loopt via een microtask, zoals in ConsentContext (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!ready || !hasChoice) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!activation.initializeGA4) setGa4Ready(false);
      if (activation.loadGoogleTag) {
        if (!googleBootstrapped.current) {
          window.dataLayer = window.dataLayer || [];
          window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
          window.gtag("consent", "default", {
            analytics_storage: "denied",
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
          });
          window.gtag("js", new Date());
          window.gtag("consent", "update", {
            analytics_storage: statistics ? "granted" : "denied",
            ad_storage: marketing ? "granted" : "denied",
            ad_user_data: marketing ? "granted" : "denied",
            ad_personalization: marketing ? "granted" : "denied",
          });
          googleBootstrapped.current = true;
        }

        if (activation.initializeGA4 && gaMeasurementId && !ga4Initialized.current) {
          window.gtag?.("config", gaMeasurementId, { send_page_view: false });
          ga4Initialized.current = true;
        }
        if (activation.initializeGA4 && gaMeasurementId) setGa4Ready(true);
        if (activation.initializeGoogleAds && googleAdsId && !googleAdsInitialized.current) {
          window.gtag?.("config", googleAdsId);
          googleAdsInitialized.current = true;
        }

        setGoogleTagSrcId((current) =>
          current ?? (activation.initializeGA4 ? gaMeasurementId : googleAdsId),
        );
      }
      if (metaPixelId && marketing) setLoadMetaPixel(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    ready,
    hasChoice,
    statistics,
    marketing,
    activation.initializeGA4,
    activation.initializeGoogleAds,
    activation.loadGoogleTag,
  ]);

  // Iedere consentwijziging — óók intrekking — direct doorgeven aan reeds
  // geladen scripts, en niet-toegestane trackercookies opruimen. Werkt zonder
  // paginaherlading omdat dit uitsluitend JS-API-aanroepen op de al geladen
  // libraries zijn.
  useEffect(() => {
    if (!ready || !hasChoice) return;
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: statistics ? "granted" : "denied",
        ad_storage: marketing ? "granted" : "denied",
        ad_user_data: marketing ? "granted" : "denied",
        ad_personalization: marketing ? "granted" : "denied",
      });
    }
    if (typeof window.fbq === "function") {
      window.fbq("consent", marketing ? "grant" : "revoke");
    }
    if (!statistics) deleteCookiesMatching(GA_COOKIE_EXACT, GA_COOKIE_PREFIX);
    if (!marketing) {
      deleteCookiesMatching(GOOGLE_ADS_COOKIE_EXACT, GOOGLE_ADS_COOKIE_PREFIX);
      deleteCookiesMatching(META_COOKIE_EXACT, []);
    }
  }, [ready, hasChoice, statistics, marketing]);

  // SPA-navigatie binnen de App Router ververst de pagina niet volledig, dus
  // page_view/PageView moeten na iedere route-wissel opnieuw worden gemeld.
  // De categorie-check hier is een tweede, eigen verdedigingslinie bovenop
  // Consent Mode: zelfs als deze check ontbrak, onderdrukt Google's library
  // zelf een hit bij denied consent.
  useEffect(() => {
    if (!ready || !hasChoice) return;
    const page_path = searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

    if (!activation.initializeGA4 || !ga4Ready) {
      // Na intrekking mag opnieuw toestaan op dezelfde route één nieuwe
      // page_view opleveren; daarom wordt de deduplicatiesleutel gewist.
      lastGaPageView.current = null;
    } else if (lastGaPageView.current !== page_path && typeof window.gtag === "function") {
      window.gtag("event", "page_view", { page_path });
      lastGaPageView.current = page_path;
    }

    if (!marketing || !metaPixelId || !metaPixelReady) {
      lastMetaPageView.current = null;
    } else if (lastMetaPageView.current !== page_path && typeof window.fbq === "function") {
      window.fbq("track", "PageView");
      lastMetaPageView.current = page_path;
    }
  }, [
    pathname,
    searchParams,
    ready,
    hasChoice,
    marketing,
    metaPixelReady,
    ga4Ready,
    activation.initializeGA4,
  ]);

  return (
    <>
      {googleTagSrcId ? (
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${googleTagSrcId}`}
          strategy="afterInteractive"
        />
      ) : null}

      {loadMetaPixel ? (
        <>
          <Script
            id="meta-pixel-init"
            strategy="afterInteractive"
            onReady={() => setMetaPixelReady(true)}
          >
            {`
              !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
              n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
              document,'script','https://connect.facebook.net/en_US/fbevents.js');
              fbq('consent', 'grant');
              fbq('init', '${metaPixelId}');
            `}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              alt=""
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      ) : null}
    </>
  );
}
