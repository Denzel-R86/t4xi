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
 * Het annuleringsbeleid (artikel 7) is op 2026-07-20 door de eigenaar vastgesteld.
 * De aansprakelijkheidsbepaling (artikel 9) volgt dwingend Nederlands recht:
 * aansprakelijkheid voor dood of letsel wordt niet uitgesloten, en er staan bewust
 * GEEN bedragen of dekkingsgrenzen in.
 *
 * ── VERZEKERINGSTOETSING 2026-07-21 ────────────────────────────────────────
 *
 * Artikel 9 is getoetst aan polis 3018880 (Noir Ventures, Victor Insurance
 * Europe B.V. als gevolmachtigde) met polisaanhangsel d.d. 27-11-2025, en aan
 * AV_Z 2021-1, BV_PAvp 2021-1 en BV_SVI 2022-1.
 *
 * Uitkomst: de voorwaarden beloven niets ruimers dan de dekking.
 *
 * Twee bepalingen dragen dat:
 *   · BV_PAvp art. 9.7 sluit vervoer tegen betaling UIT, "tenzij anders is
 *     overeengekomen". Clausule 156 is die afspraak. De hele taxidekking hangt
 *     aan die clausule.
 *   · BV_PAvp art. 4.2a sluit schade aan vervoerde zaken uit, behalve normale
 *     handbagage en kleding. Clausule 156 verruimt dat tot zaken van vervoerde
 *     personen, maar alleen TOT HET WETTELIJK VOORGESCHREVEN BEDRAG en alleen
 *     bij vervoer krachtens een Wp2000-vergunning.
 *
 * Daarom staat er in artikel 9 geen bedrag en geen toezegging dat bagage
 * "verzekerd" is: het is aansprakelijkheidsdekking met een wettelijk plafond,
 * geen bagageverzekering. Neem hier geen bedrag op zonder de polis opnieuw te
 * toetsen — en houd er rekening mee dat een verlopen Wp2000-vergunning deze
 * dekking laat vervallen.
 *
 * Nog te doen vóór livegang:
 *   · tarief voor wachttijd buiten de inbegrepen 60 minuten;
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
        Bij ritten van of naar een luchthaven vragen wij uw vluchtnummer. Wij onderscheiden
        twee situaties, omdat de afspraken verschillen:
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">
        Ophalen ván een luchthaven (aankomende vlucht)
      </h3>
      <p className={P}>
        Wij volgen uw vluchtstatus en passen het ophaalmoment aan wanneer uw vlucht
        vertraagd is. U hoeft ons daarvoor niet te bellen.
      </p>
      <p className={P}>
        <strong>Na de geregistreerde landingstijd is 60 minuten wachttijd inbegrepen</strong>{" "}
        voor uitstappen, grenscontrole en bagage. Die termijn begint dus niet bij de geplande
        aankomsttijd, maar bij het moment waarop uw toestel daadwerkelijk is geland. Extra
        wachttijd die niet door de vluchtvertraging wordt veroorzaakt, stemmen wij vooraf met
        u af en kan apart in rekening worden gebracht.
      </p>
      <p className={P}>
        De exacte ophaallocatie op de luchthaven stemmen wij na de landing persoonlijk met u
        af, via WhatsApp of telefoon. Wij noemen die locatie bewust niet vooraf: luchthavens
        wijzen op- en afstapplaatsen aan en kunnen die wijzigen, en wij willen u geen plek
        toezeggen die op het moment van aankomst niet meer klopt.
      </p>
      <p className={P}>
        Wij baseren ons op vluchtinformatie van externe bronnen. Die informatie kan wijzigen,
        onvolledig zijn of met vertraging beschikbaar komen. Wij spannen ons in om de
        aankomst juist te volgen, maar kunnen de juistheid van gegevens van derden niet
        garanderen. Merkt u dat de gegevens niet kloppen, neem dan contact met ons op.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">
        Brengen náár een luchthaven (vertrekkende vlucht)
      </h3>
      <p className={P}>
        Wij gebruiken uw vluchtnummer om de rit op uw vertrektijd te plannen. Voor een rit
        náár een luchthaven geldt geen inbegrepen wachttijd: die is bedoeld voor aankomsten.
      </p>

      <p className={P}>
        Geeft u geen of een onjuist vluchtnummer op, dan kunnen wij uw vlucht niet volgen en
        geldt het oorspronkelijk afgesproken ophaalmoment.
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

      <h2 className={H2}>7 · Annulering, wijziging en no-show</h2>
      <p className={P}>
        U kunt uw rit kosteloos annuleren tot 24 uur vóór de afgesproken ophaaltijd. Daarna
        gelden de onderstaande kosten, omdat de rit dan is ingepland en de tijd van de
        chauffeur niet meer opnieuw verkocht kan worden:
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-[0.1em] text-stone">
              <th className="py-2 pr-4 font-medium">Moment van annuleren</th>
              <th className="py-2 font-medium">Kosten</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4 text-secondary">Meer dan 24 uur vooraf</td>
              <td className="py-2.5 font-medium text-ink">kosteloos</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4 text-secondary">Tussen 24 en 6 uur vooraf</td>
              <td className="py-2.5 font-medium text-ink">50% van de ritprijs</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4 text-secondary">Minder dan 6 uur vooraf</td>
              <td className="py-2.5 font-medium text-ink">100% van de ritprijs</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4 text-secondary">No-show</td>
              <td className="py-2.5 font-medium text-ink">100% van de ritprijs</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Wanneer is er sprake van een no-show?</h3>
      <p className={P}>
        Van een no-show spreken wij pas als aan alle vier de voorwaarden is voldaan: de
        chauffeur is op de bevestigde ophaallocatie aanwezig, er is geprobeerd persoonlijk
        contact met u op te nemen, de inbegrepen wachttijd is verstreken, en u bent niet
        verschenen. Bij luchthavenophalingen begint die wachttijd te lopen vanaf de
        daadwerkelijk geregistreerde landingstijd, volgens het luchthavenbeleid in artikel 3.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Geannuleerde vlucht</h3>
      <p className={P}>
        Wordt uw vlucht geannuleerd, dan kunt u kosteloos annuleren, mits u dit vóór het
        geplande ophaalmoment aan ons meldt. Wij kunnen u vragen de annulering aan te tonen,
        bijvoorbeeld met het bericht van de luchtvaartmaatschappij.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Wijzigen is geen annuleren</h3>
      <p className={P}>
        Een wijziging van route, datum of tijd geldt niet automatisch als annulering. Wij
        beoordelen eerst of de wijziging operationeel uitvoerbaar is. Leidt de wijziging tot
        een andere route of een andere prijs, dan bevestigen wij eerst de nieuwe prijs; die
        geldt pas nadat u deze heeft geaccepteerd.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Annulering door T4XI</h3>
      <p className={P}>
        Moeten wij een rit annuleren, dan betalen wij reeds betaalde bedragen volledig terug.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Hoe annuleert u?</h3>
      <p className={P}>
        Per e-mail via{" "}
        <a className="underline" href={`mailto:${BEDRIJF.email}`}>
          {BEDRIJF.email}
        </a>{" "}
        of telefonisch via{" "}
        <a className="underline" href={BEDRIJF.telefoonHref}>
          {BEDRIJF.telefoon}
        </a>
        . Het moment waarop uw bericht ons bereikt, bepaalt welk tarief hierboven geldt.
        Komt er later een boekingsportaal beschikbaar, dan kunt u ook daar annuleren.
      </p>

      <h2 className={H2}>8 · Betaling</h2>
      <p className={P}>
        Betaling vindt plaats zoals bij de bevestiging met u afgesproken. Via deze website
        worden geen betaalgegevens verzameld of opgeslagen.
      </p>

      <h2 className={H2}>9 · Aansprakelijkheid</h2>
      <p className={P}>
        Op de vervoersovereenkomst zijn onder meer de wettelijke regels voor personenvervoer
        uit Boek 8 van het Burgerlijk Wetboek van toepassing.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Letsel en overlijden</h3>
      <p className={P}>
        Onze aansprakelijkheid voor dood of lichamelijk letsel in verband met het vervoer
        wordt niet uitgesloten en niet verder beperkt dan het dwingend Nederlands recht
        toestaat. Wij nemen daarover geen afwijkende bepaling op.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Gevolgschade</h3>
      <p className={P}>
        Wij zijn niet aansprakelijk voor indirecte schade of gevolgschade, waaronder gemiste
        vluchten, gemiste afspraken, omzetverlies en winstderving — behalve voor zover
        uitsluiting daarvan volgens dwingend recht niet is toegestaan.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Bagage</h3>
      <p className={P}>
        Bij vermissing of beschadiging van bagage wordt onze aansprakelijkheid beoordeeld
        volgens het toepasselijke recht en de daadwerkelijke dekking van onze
        taxiverzekering. Wij hanteren geen vooraf vastgesteld maximumbedrag dat losstaat van
        die dekking.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Vertraging</h3>
      <p className={P}>
        Wij zijn niet aansprakelijk voor vertraging die het gevolg is van omstandigheden die
        een zorgvuldig vervoerder redelijkerwijs niet kon vermijden, zoals onverwachte
        wegafsluitingen, ernstige ongevallen, extreme weersomstandigheden, overheidsmaatregelen
        of andere overmacht.
      </p>
      <p className={P}>
        Dat is geen vrijbrief: wij spannen ons in om u tijdig te informeren zodra wij weten
        dat de rit vertraging oploopt, en bieden waar dat redelijk is een alternatief aan.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Wat wij van u vragen</h3>
      <p className={P}>
        U bent verantwoordelijk voor het opgeven van correcte boekingsgegevens, voor tijdige
        aanwezigheid op de afgesproken ophaallocatie, voor geldige reisdocumenten, en voor het
        vooraf melden van bijzondere bagage of specifieke vervoersbehoeften — bijvoorbeeld een
        kinderzitje, een rolstoel of een instrument.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Strijd met dwingend recht</h3>
      <p className={P}>
        Blijkt een bepaling uit deze voorwaarden in strijd met dwingend consumenten- of
        vervoersrecht, dan blijft die bepaling buiten toepassing. De overige voorwaarden
        blijven dan onverkort gelden.
      </p>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Onze verzekering</h3>
      <p className={P}>
        Wij vervoeren u met een voertuig dat verzekerd is voor personenvervoer tegen
        betaling. Wilt u weten wat dat in een concreet geval betekent, dan lichten wij
        dat op verzoek toe.
      </p>

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
