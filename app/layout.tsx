import type { Metadata } from "next";
import Script from "next/script";
import { Outfit, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

/*
 * TYPOGRAFIE — bewuste afwijking van de Brand Guide (besluit eigenaar, 22-07-2026).
 *
 * De T4XI Brand Guide 2026 noemt Helvetica/Arial als systeemtypografie. Dat is
 * de veilige keuze voor drukwerk en collateral, geen webvoorschrift. De site
 * gebruikt Outfit (display), Inter (tekst) en Playfair Display (accenten,
 * dagtochten) omdat die de "premium uitstraling" uit dezelfde guide op het web
 * beter dragen. Kleur volgt de guide wél strikt: Primary Navy #28313B is het
 * accent (tailwind.config.ts → ink/accent).
 */
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import StickyCta from "@/components/sections/StickyCta";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Dagtochten-pagina gebruikt Playfair Display voor routenamen (bron: t4xi_v14)
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://t4xi.nl"),
  title: {
    default: "T4XI — Premium taxi & elektrische mobiliteit",
    template: "%s — T4XI",
  },
  description:
    "T4XI is het premium Nederlandse taxiplatform. 100% elektrisch, vaste tarieven, professionele chauffeurs. Arrive with confidence.",
  openGraph: {
    type: "website",
    locale: "nl_NL",
    siteName: "T4XI",
  },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

// Structured data voor lokale vindbaarheid (Google rich results)
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "TaxiService",
  name: "T4XI",
  url: "https://t4xi.nl",
  slogan: "Arrive with confidence.",
  // Alleen steden waar daadwerkelijk actieve vaste routes voor bestaan.
  // Rotterdam, Den Haag en Utrecht draaien sinds juli 2026 en ontbraken hier.
  areaServed: [
    "Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Almere",
    "Noord-Holland", "Zuid-Holland", "Flevoland",
  ],
  provider: {
    "@type": "LocalBusiness",
    name: "Noir Driving Services",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Almere",
      addressCountry: "NL",
    },
    telephone: "+31634744522",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // suppressHydrationWarning hoort op <html>: het `js-detect`-script draait
  // `beforeInteractive` en zet de class `js` vóórdat React hydrateert. React
  // vergelijkt dan een DOM mét die class tegen een render zónder, en meldt
  // terecht een verschil.
  //
  // Dat verschil is opzettelijk en mag NIET worden opgelost door `js`
  // server-side mee te renderen: dan krijgen ook bezoekers zónder JavaScript de
  // class, blijft `.reveal` verborgen en zien zij een lege pagina. De detectie
  // werkt alleen als de class uitsluitend door de browser wordt gezet.
  //
  // Het attribuut werkt één niveau diep — alleen de attributen van dit element
  // zelf. Echte hydration-verschillen in de pagina-inhoud blijven zichtbaar.
  return (
    <html
      lang="nl"
      suppressHydrationWarning
      className={`${outfit.variable} ${inter.variable} ${playfair.variable}`}
    >
      <body>
        {/* Progressive enhancement: .reveal verbergt content alleen als JS
            daadwerkelijk draait. Zonder JS blijft alles zichtbaar. */}
        <Script id="js-detect" strategy="beforeInteractive">
          {`document.documentElement.classList.add("js");`}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Skip-link: eerste tab-stop, zichtbaar zodra hij focus krijgt.
            Zonder deze link moet een toetsenbordgebruiker de hele navigatie
            doorlopen voordat hij bij de inhoud is. */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-fog focus:outline-none focus:ring-2 focus:ring-accent"
        >
          Naar de inhoud
        </a>
        <Header />
        <main id="content">{children}</main>
        <Footer />
        <StickyCta />
      </body>
    </html>
  );
}
