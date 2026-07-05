import type { Metadata } from "next";
import Script from "next/script";
import { Outfit, Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";

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
  areaServed: ["Almere", "Amsterdam", "Flevoland"],
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
  return (
    <html lang="nl" className={`${outfit.variable} ${inter.variable}`}>
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
        <Header />
        <main id="content">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
