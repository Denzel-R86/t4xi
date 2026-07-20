import type { Metadata } from "next";
import Link from "next/link";
import { BEDRIJF, LAATST_BIJGEWERKT } from "@/lib/legal";

/**
 * Algemene voorwaarden.
 *
 * ── CONCEPT — JURIDISCHE TOETSING VEREIST ──────────────────────────────────
 *
 * De bepalingen over prijs, wachttijd bij vluchtvertraging en vluchtstatus zijn
 * woordelijk afgestemd op wat T4XI operationeel toezegt (Sprint 11). Ze zijn dus
 * feitelijk juist, maar juridisch ongetoetst.
 *
 * Nog vast te stellen door de eigenaar vóór livegang:
 *   · annuleringsvoorwaarden en eventuele kosten;
 *   · tarief voor wachttijd buiten de inbegrepen 60 minuten;
 *   · aansprakelijkheidsbeperking en verzekeringsdekking;
 *   · toetsing door een jurist.
 *
 * Waar een bepaling nog niet is vastgesteld, staat dat er zichtbaar bij in plaats
 * van dat er een gebruikelijk klinkende bepaling wordt verzonnen.
 */

export const metadata: Metadata = {
  title: "Algemene voorwaarden",
  description:
    "De voorwaarden waaronder T4XI vervoer levert: vaste prijzen, luchthavenbeleid bij " +
    "vluchtvertraging, bagage en aansprakelijkheid.",
  alternates: { canonical: "/voorwaarden" },
};

const H2 = "mt-10 font-display text-xl font-bold text-ink";
const P = "mt-3 text-secondary";
const TODO =
  "mt-3 rounded-md border-l-2 border-amber-500 bg-amber-100/40 px-4 py-3 text-sm text-ink";

export default function VoorwaardenPage() {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-16 md:py-24">
      <p className="text-eyebrow font-medium uppercase text-accent">Juridisch</p>
      <h1 className="mt-4 font-display text-display-lg font-bold text-ink">
        Algemene voorwaarden
      </h1>
      <p className="mt-4 text-secondary">
        Laatst bijgewerkt op {LAATST_BIJGEWERKT}. Deze voorwaarden gelden voor alle ritten
        die u boekt bij {BEDRIJF.rechtspersoon}, handelend onder de naam{" "}
        {BEDRIJF.handelsnaam}.
      </p>

      <h2 className={H2}>1 · Wie wij zijn</h2>
      <p className={P}>
        {BEDRIJF.rechtspersoon}, gevestigd te {BEDRIJF.vestigingsplaats}.
        <br />
        KvK-nummer: {BEDRIJF.kvk}
        <br />
        {BEDRIJF.btw ? (
          <>Btw-identificatienummer: {BEDRIJF.btw}</>
        ) : (
          <mark className="bg-amber-200/60 px-1 font-medium text-ink">
            [ONTBREEKT — btw-identificatienummer aanleveren vóór publicatie]
          </mark>
        )}
      </p>

      <h2 className={H2}>2 · Vaste prijs</h2>
      <p className={P}>
        De prijs die u vóór het boeken ziet, is de prijs die u betaalt. Die prijs is
        inclusief btw en geldt voor de opgegeven route, ongeacht de daadwerkelijke
        reistijd. Files, omrijden door wegwerkzaamheden of oponthoud onderweg leiden niet
        tot een hogere prijs — dat risico ligt bij ons.
      </p>
      <p className={P}>
        Er wordt geen taxameter gebruikt en wij hanteren geen surge pricing. Voor ritten
        die aanvangen tussen 23:00 en 06:00 geldt een nachttarief van 15%, dat vooraf in de
        getoonde prijs is verwerkt.
      </p>
      <p className={P}>
        Wijzigt u na bevestiging de route, het aantal passagiers of de hoeveelheid bagage,
        dan kan een aangepaste prijs gelden. Wij stemmen dat vooraf met u af.
      </p>

      <h2 className={H2}>3 · Luchthavenritten en vluchtvertraging</h2>
      <p className={P}>
        Bij ritten van of naar een luchthaven vragen wij uw vluchtnummer. Wij volgen uw
        vluchtstatus en passen het ophaalmoment aan wanneer uw vlucht vertraagd is. U hoeft
        ons daarvoor niet te bellen.
      </p>
      <p className={P}>
        Na de daadwerkelijke landing is 60 minuten wachttijd inbegrepen voor uitstappen,
        grenscontrole en bagage. Extra wachttijd die niet door de vluchtvertraging wordt
        veroorzaakt, stemmen wij vooraf met u af en kan apart in rekening worden gebracht.
      </p>
      <p className={P}>
        Geeft u geen of een onjuist vluchtnummer op, dan kunnen wij uw vlucht niet volgen
        en geldt het oorspronkelijk afgesproken ophaalmoment.
      </p>

      <h2 className={H2}>4 · Voertuig en capaciteit</h2>
      <p className={P}>
        Wij rijden met een Tesla Model Y (volledig elektrisch) of een Lynk &amp; Co 01
        (plug-in hybride). De prijs is voor beide gelijk. Wij bevestigen vooraf de
        voertuigcategorie; welke auto uiteindelijk rijdt, kan om operationele redenen
        afwijken.
      </p>
      <p className={P}>
        Een rit is bedoeld voor maximaal 4 passagiers exclusief chauffeur. Adviesbagage: 2
        grote koffers plus 2 handbagage bij 4 passagiers, of 3 grote koffers bij maximaal 3
        passagiers. Heeft u meer bagage, geef dat dan bij de boeking aan, zodat wij een
        passend voertuig kunnen inplannen.
      </p>

      <h2 className={H2}>5 · Chauffeur</h2>
      <p className={P}>
        Uw chauffeur beschikt over een geldige Nederlandse taxichauffeurskaart en rijdt
        namens {BEDRIJF.rechtspersoon}.
      </p>

      <h2 className={H2}>6 · Boeking en bevestiging</h2>
      <p className={P}>
        Een boeking komt tot stand zodra wij deze aan u bevestigen per e-mail of WhatsApp.
        De aanvraag zelf is nog geen overeenkomst. Wij adviseren minimaal twee uur voor de
        gewenste vertrektijd te boeken; voor vluchten vóór 07:00 bij voorkeur de avond
        ervoor.
      </p>

      <h2 className={H2}>7 · Annulering</h2>
      <div className={TODO}>
        <b>Nog vast te stellen.</b> De annuleringstermijn en eventuele kosten zijn nog niet
        bepaald. Deze bepaling wordt aangevuld vóór publicatie; tot die tijd stemmen wij
        annuleringen in overleg af via {BEDRIJF.telefoon}.
      </div>

      <h2 className={H2}>8 · Betaling</h2>
      <p className={P}>
        Betaling vindt plaats zoals bij de bevestiging met u afgesproken. Via deze website
        worden geen betaalgegevens verzameld of opgeslagen.
      </p>

      <h2 className={H2}>9 · Aansprakelijkheid</h2>
      <div className={TODO}>
        <b>Nog vast te stellen.</b> De aansprakelijkheidsbepaling moet worden afgestemd op
        de verzekeringsdekking en juridisch worden getoetst. Er is bewust geen standaard
        beperkingsclausule opgenomen die de dekking niet weerspiegelt.
      </div>

      <h2 className={H2}>10 · Klachten en toepasselijk recht</h2>
      <p className={P}>
        Klachten kunt u indienen via{" "}
        <a className="underline" href={`mailto:${BEDRIJF.email}`}>
          {BEDRIJF.email}
        </a>{" "}
        of {BEDRIJF.telefoon}. Op deze voorwaarden is Nederlands recht van toepassing.
      </p>

      <p className="mt-12 border-t border-line pt-6 text-sm text-secondary">
        Zie ook onze{" "}
        <Link href="/privacy" className="underline">
          privacyverklaring
        </Link>
        .
      </p>
    </main>
  );
}
