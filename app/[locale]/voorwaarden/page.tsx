import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo-locale";
import { BEDRIJF, getLaatstBijgewerkt } from "@/lib/legal";

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
 * Artikel 2 regelt verlenging op verzoek van de klant zonder een tarief te
 * noemen: meerkosten worden vooraf afgesproken en zonder akkoord niet in
 * rekening gebracht. Dat is bewust — een bepaling die verwijst naar "het
 * geldende wachttarief" terwijl er geen tarief is gepubliceerd, is voor de
 * klant niet bepaalbaar en daarmee aanvechtbaar.
 *
 * Nog te doen (v1.1, niet blokkerend voor livegang):
 *   · een gepubliceerd wachttarief per uur, zodra de kostprijs is vastgesteld;
 *   · toetsing door een jurist.
 *
 * De Engelse versie (stap 6) is een gemaksvertaling van EXACT deze Nederlandse
 * bron, met dezelfde artikelnummering en juridische betekenis; bij
 * tegenstrijdigheid prevaleert het Nederlands (disclaimer bovenaan de Engelse
 * variant). Waar een bepaling nog niet is vastgesteld, staat dat er zichtbaar
 * bij in plaats van dat er een gebruikelijk klinkende bepaling wordt verzonnen.
 */

export function generateMetadata({ params }: { params: { locale: string } }) {
  return pageMetadata(params.locale, "/voorwaarden", "voorwaardenTitle", "voorwaardenDesc");
}

const H2 = "mt-10 font-display text-xl font-bold text-ink";
const H3 = "mt-6 font-display text-base font-semibold text-ink";
const P = "mt-3 text-secondary";

const EN_DISCLAIMER =
  "This English version is provided for convenience. In the event of any inconsistency, the Dutch version shall prevail.";

export default function VoorwaardenPage({ params }: { params: { locale: string } }) {
  const locale = params.locale;
  setRequestLocale(locale);
  return locale === "en" ? <VoorwaardenEN /> : <VoorwaardenNL />;
}

function VoorwaardenNL() {
  return (
    <article className="mx-auto max-w-[720px] px-6 py-16 md:py-24">
      <p className="text-eyebrow font-medium uppercase text-accent">Juridisch</p>
      <h1 className="mt-4 font-display text-display-lg font-bold text-ink">
        Algemene voorwaarden
      </h1>
      <p className="mt-4 text-secondary">
        Laatst bijgewerkt op {getLaatstBijgewerkt("nl")}. Deze voorwaarden gelden voor alle ritten
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
        Er wordt geen taxameter gebruikt en wij hanteren geen dynamische prijsverhogingen. Voor ritten
        die aanvangen tussen 23:00 en 06:00 geldt een nachttarief van 15%, dat vooraf in de
        getoonde prijs is verwerkt.
      </p>
      <p className={P}>
        Wijzigt u na bevestiging de route, het aantal passagiers of de hoeveelheid bagage,
        dan kan een aangepaste prijs gelden. Wij stemmen dat vooraf met u af.
      </p>

      <h3 className={H3}>Wachttijd en verlenging op uw verzoek</h3>
      <p className={P}>
        Vraagt u onderweg om extra wachttijd, om een tussenstop of om een langer verblijf dan
        afgesproken, dan is dat mogelijk voor zover onze planning dat toelaat. Wij spreken de
        meerkosten daarvoor <strong>vooraf</strong> met u af.
      </p>
      <p className={P}>
        Zonder uw voorafgaande akkoord brengen wij geen meerkosten in rekening. Kunnen wij
        het verzoek niet inwilligen, bijvoorbeeld omdat de chauffeur een volgende rit heeft,
        dan zeggen wij dat ter plekke en blijft de oorspronkelijke afspraak gelden.
      </p>

      <h2 className={H2}>3 · Luchthavenritten en vluchtvertraging</h2>
      <p className={P}>
        Bij ritten van of naar een luchthaven vragen wij uw vluchtnummer. Wij onderscheiden
        twee situaties, omdat de afspraken verschillen:
      </p>

      <h3 className={H3}>Ophalen ván een luchthaven (aankomende vlucht)</h3>
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

      <h3 className={H3}>Brengen náár een luchthaven (vertrekkende vlucht)</h3>
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
        grote koffers plus 2 stuks handbagage bij 4 passagiers, of 3 grote koffers bij maximaal 3
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

      <h3 className={H3}>Wanneer is er sprake van een no-show?</h3>
      <p className={P}>
        Van een no-show spreken wij pas als aan alle vier de voorwaarden is voldaan: de
        chauffeur is op de bevestigde ophaallocatie aanwezig, er is geprobeerd persoonlijk
        contact met u op te nemen, de inbegrepen wachttijd is verstreken, en u bent niet
        verschenen. Bij luchthavenophalingen begint die wachttijd te lopen vanaf de
        daadwerkelijk geregistreerde landingstijd, volgens het luchthavenbeleid in artikel 3.
      </p>

      <h3 className={H3}>Geannuleerde vlucht</h3>
      <p className={P}>
        Wordt uw vlucht geannuleerd, dan kunt u kosteloos annuleren, mits u dit vóór het
        geplande ophaalmoment aan ons meldt. Wij kunnen u vragen de annulering aan te tonen,
        bijvoorbeeld met het bericht van de luchtvaartmaatschappij.
      </p>

      <h3 className={H3}>Wijzigen is geen annuleren</h3>
      <p className={P}>
        Een wijziging van route, datum of tijd geldt niet automatisch als annulering. Wij
        beoordelen eerst of de wijziging operationeel uitvoerbaar is. Leidt de wijziging tot
        een andere route of een andere prijs, dan bevestigen wij eerst de nieuwe prijs; die
        geldt pas nadat u deze heeft geaccepteerd.
      </p>

      <h3 className={H3}>Annulering door T4XI</h3>
      <p className={P}>
        Moeten wij een rit annuleren, dan betalen wij reeds betaalde bedragen volledig terug.
      </p>

      <h3 className={H3}>Hoe annuleert u?</h3>
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
        Betaling vindt plaats zoals bij de bevestiging met u afgesproken. Bij online betaling
        voert u uw betaalgegevens rechtstreeks in het beveiligde betaalveld van Stripe in.
        T4XI bewaart geen volledige kaartgegevens, maar wel het bedrag, de betaalstatus en de
        technische betaalreferentie die bij uw boeking horen.
      </p>

      <h2 className={H2}>9 · Aansprakelijkheid</h2>
      <p className={P}>
        Op de vervoersovereenkomst zijn onder meer de wettelijke regels voor personenvervoer
        uit Boek 8 van het Burgerlijk Wetboek van toepassing.
      </p>

      <h3 className={H3}>Letsel en overlijden</h3>
      <p className={P}>
        Onze aansprakelijkheid voor dood of lichamelijk letsel in verband met het vervoer
        wordt niet uitgesloten en niet verder beperkt dan het dwingend Nederlands recht
        toestaat. Wij nemen daarover geen afwijkende bepaling op.
      </p>

      <h3 className={H3}>Gevolgschade</h3>
      <p className={P}>
        Wij zijn niet aansprakelijk voor indirecte schade of gevolgschade, waaronder gemiste
        vluchten, gemiste afspraken, omzetverlies en winstderving — behalve voor zover
        uitsluiting daarvan volgens dwingend recht niet is toegestaan.
      </p>

      <h3 className={H3}>Bagage</h3>
      <p className={P}>
        Bij vermissing of beschadiging van bagage wordt onze aansprakelijkheid beoordeeld
        volgens het toepasselijke recht en de daadwerkelijke dekking van onze
        taxiverzekering. Wij hanteren geen vooraf vastgesteld maximumbedrag dat losstaat van
        die dekking.
      </p>

      <h3 className={H3}>Vertraging</h3>
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

      <h3 className={H3}>Wat wij van u vragen</h3>
      <p className={P}>
        U bent verantwoordelijk voor het opgeven van correcte boekingsgegevens, voor tijdige
        aanwezigheid op de afgesproken ophaallocatie, voor geldige reisdocumenten, en voor het
        vooraf melden van bijzondere bagage of specifieke vervoersbehoeften — bijvoorbeeld een
        kinderzitje, een rolstoel of een instrument.
      </p>

      <h3 className={H3}>Strijd met dwingend recht</h3>
      <p className={P}>
        Blijkt een bepaling uit deze voorwaarden in strijd met dwingend consumenten- of
        vervoersrecht, dan blijft die bepaling buiten toepassing. De overige voorwaarden
        blijven dan onverkort gelden.
      </p>

      <h3 className={H3}>Onze verzekering</h3>
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
    </article>
  );
}

function VoorwaardenEN() {
  return (
    <article className="mx-auto max-w-[720px] px-6 py-16 md:py-24">
      <p className="text-eyebrow font-medium uppercase text-accent">Legal</p>
      <h1 className="mt-4 font-display text-display-lg font-bold text-ink">
        Terms and conditions
      </h1>
      <p className="mt-4 rounded-lg border border-line bg-fog px-4 py-3 text-sm text-secondary">
        {EN_DISCLAIMER}
      </p>
      <p className="mt-4 text-secondary">
        Last updated on {getLaatstBijgewerkt("en")}. These terms apply to all rides you book
        with {BEDRIJF.rechtspersoon}, trading under the name {BEDRIJF.handelsnaam}.
      </p>

      <h2 className={H2}>1 · Who we are</h2>
      <p className={P}>
        {BEDRIJF.rechtspersoon}, established in {BEDRIJF.vestigingsplaats}.
        <br />
        Chamber of Commerce number: {BEDRIJF.kvk}
        <br />
        {BEDRIJF.btw ? (
          <>VAT identification number: {BEDRIJF.btw}</>
        ) : (
          <mark className="bg-amber-200/60 px-1 font-medium text-ink">
            [MISSING — provide VAT identification number before publication]
          </mark>
        )}
      </p>

      <h2 className={H2}>2 · Fixed price</h2>
      <p className={P}>
        The price you see before booking is the price you pay. That price includes VAT and
        applies to the route you enter, regardless of the actual travel time. Traffic jams,
        detours due to roadworks or delays en route do not lead to a higher price — that risk
        lies with us.
      </p>
      <p className={P}>
        No taximeter is used and we do not apply surge pricing. For rides starting between
        23:00 and 06:00 a night surcharge of 15% applies, which is already included in the
        price shown.
      </p>
      <p className={P}>
        If, after confirmation, you change the route, the number of passengers or the amount
        of luggage, an adjusted price may apply. We agree this with you in advance.
      </p>

      <h3 className={H3}>Waiting time and extension at your request</h3>
      <p className={P}>
        If you ask for extra waiting time, a stopover or a longer stay than agreed while en
        route, this is possible in so far as our scheduling allows. We agree the additional
        costs for this with you <strong>in advance</strong>.
      </p>
      <p className={P}>
        Without your prior agreement we do not charge any additional costs. If we cannot grant
        the request, for example because the driver has a subsequent ride, we say so on the
        spot and the original arrangement remains in force.
      </p>

      <h2 className={H2}>3 · Airport rides and flight delays</h2>
      <p className={P}>
        For rides from or to an airport we ask for your flight number. We distinguish two
        situations, because the arrangements differ:
      </p>

      <h3 className={H3}>Pick-up from an airport (arriving flight)</h3>
      <p className={P}>
        We track your flight status and adjust the pick-up time when your flight is delayed.
        You do not need to call us for this.
      </p>
      <p className={P}>
        <strong>After the registered landing time, 60 minutes of waiting time is included</strong>{" "}
        for disembarking, border control and baggage. That period therefore does not start at
        the scheduled arrival time, but at the moment your aircraft has actually landed. Extra
        waiting time not caused by the flight delay is agreed with you in advance and may be
        charged separately.
      </p>
      <p className={P}>
        We agree the exact pick-up location at the airport with you personally after landing,
        via WhatsApp or telephone. We deliberately do not state that location in advance:
        airports designate pick-up and drop-off points and may change them, and we do not want
        to promise you a place that no longer applies at the moment of arrival.
      </p>
      <p className={P}>
        We rely on flight information from external sources. That information may change, be
        incomplete or become available with a delay. We make every effort to track the arrival
        correctly, but cannot guarantee the accuracy of third-party data. If you notice that
        the data is incorrect, please contact us.
      </p>

      <h3 className={H3}>Taking you to an airport (departing flight)</h3>
      <p className={P}>
        We use your flight number to plan the ride around your departure time. For a ride to
        an airport no waiting time is included: that is intended for arrivals.
      </p>

      <p className={P}>
        If you provide no flight number or an incorrect one, we cannot track your flight and
        the originally agreed pick-up time applies.
      </p>

      <h2 className={H2}>4 · Vehicle and capacity</h2>
      <p className={P}>
        We drive a Tesla Model Y (fully electric) or a Lynk &amp; Co 01 (plug-in hybrid). The
        price is the same for both. We confirm the vehicle category in advance; which car
        ultimately drives may differ for operational reasons.
      </p>
      <p className={P}>
        A ride is intended for a maximum of 4 passengers excluding the driver. Recommended
        luggage: 2 large suitcases plus 2 pieces of hand luggage with 4 passengers, or 3 large
        suitcases with up to 3 passengers. If you have more luggage, please state this when
        booking, so that we can schedule a suitable vehicle.
      </p>

      <h2 className={H2}>5 · Driver</h2>
      <p className={P}>
        Your driver holds a valid Dutch taxi driver&apos;s card and drives on behalf of{" "}
        {BEDRIJF.rechtspersoon}.
      </p>

      <h2 className={H2}>6 · Booking and confirmation</h2>
      <p className={P}>
        A booking is formed as soon as we confirm it to you by email or WhatsApp. The request
        itself is not yet an agreement. We advise booking at least two hours before the desired
        departure time; for flights before 07:00 preferably the evening before.
      </p>

      <h2 className={H2}>7 · Cancellation, changes and no-show</h2>
      <p className={P}>
        You can cancel your ride free of charge up to 24 hours before the agreed pick-up time.
        After that, the costs below apply, because the ride is then scheduled and the
        driver&apos;s time can no longer be resold:
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-[0.1em] text-stone">
              <th className="py-2 pr-4 font-medium">Time of cancellation</th>
              <th className="py-2 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4 text-secondary">More than 24 hours in advance</td>
              <td className="py-2.5 font-medium text-ink">free of charge</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4 text-secondary">Between 24 and 6 hours in advance</td>
              <td className="py-2.5 font-medium text-ink">50% of the ride price</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4 text-secondary">Less than 6 hours in advance</td>
              <td className="py-2.5 font-medium text-ink">100% of the ride price</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4 text-secondary">No-show</td>
              <td className="py-2.5 font-medium text-ink">100% of the ride price</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className={H3}>When is there a no-show?</h3>
      <p className={P}>
        We only speak of a no-show once all four conditions are met: the driver is present at
        the confirmed pick-up location, an attempt has been made to contact you personally, the
        included waiting time has elapsed, and you have not appeared. For airport pick-ups that
        waiting time starts from the actually registered landing time, in accordance with the
        airport policy in article 3.
      </p>

      <h3 className={H3}>Cancelled flight</h3>
      <p className={P}>
        If your flight is cancelled, you can cancel free of charge, provided you notify us
        before the planned pick-up time. We may ask you to demonstrate the cancellation, for
        example with the message from the airline.
      </p>

      <h3 className={H3}>Changing is not cancelling</h3>
      <p className={P}>
        A change of route, date or time does not automatically count as a cancellation. We
        first assess whether the change is operationally feasible. If the change leads to a
        different route or a different price, we first confirm the new price; it applies only
        after you have accepted it.
      </p>

      <h3 className={H3}>Cancellation by T4XI</h3>
      <p className={P}>
        If we have to cancel a ride, we refund any amounts already paid in full.
      </p>

      <h3 className={H3}>How do you cancel?</h3>
      <p className={P}>
        By email at{" "}
        <a className="underline" href={`mailto:${BEDRIJF.email}`}>
          {BEDRIJF.email}
        </a>{" "}
        or by phone at{" "}
        <a className="underline" href={BEDRIJF.telefoonHref}>
          {BEDRIJF.telefoon}
        </a>
        . The moment your message reaches us determines which rate above applies. If a booking
        portal becomes available later, you can also cancel there.
      </p>

      <h2 className={H2}>8 · Payment</h2>
      <p className={P}>
        Payment takes place as agreed with you at confirmation. For online payment, you enter
        your payment details directly in Stripe&apos;s secure payment field. T4XI does not store
        full card details, but does retain the amount, payment status and technical payment
        reference associated with your booking.
      </p>

      <h2 className={H2}>9 · Liability</h2>
      <p className={P}>
        The transport agreement is governed, among other things, by the statutory rules for
        passenger transport in Book 8 of the Dutch Civil Code.
      </p>

      <h3 className={H3}>Injury and death</h3>
      <p className={P}>
        Our liability for death or bodily injury in connection with the transport is not
        excluded and not limited any further than mandatory Dutch law permits. We include no
        deviating provision on this.
      </p>

      <h3 className={H3}>Consequential loss</h3>
      <p className={P}>
        We are not liable for indirect or consequential loss, including missed flights, missed
        appointments, loss of turnover and loss of profit — except in so far as excluding this
        is not permitted under mandatory law.
      </p>

      <h3 className={H3}>Luggage</h3>
      <p className={P}>
        In the event of loss of or damage to luggage, our liability is assessed according to
        the applicable law and the actual cover of our taxi insurance. We do not apply a
        predetermined maximum amount independent of that cover.
      </p>

      <h3 className={H3}>Delay</h3>
      <p className={P}>
        We are not liable for delay resulting from circumstances that a diligent carrier could
        not reasonably have avoided, such as unexpected road closures, serious accidents,
        extreme weather conditions, government measures or other force majeure.
      </p>
      <p className={P}>
        That is not a carte blanche: we make every effort to inform you in good time once we
        know that the ride is being delayed, and offer an alternative where that is reasonable.
      </p>

      <h3 className={H3}>What we ask of you</h3>
      <p className={P}>
        You are responsible for providing correct booking details, for being present on time
        at the agreed pick-up location, for valid travel documents, and for reporting special
        luggage or specific transport needs in advance — for example a child seat, a wheelchair
        or an instrument.
      </p>

      <h3 className={H3}>Conflict with mandatory law</h3>
      <p className={P}>
        If a provision of these terms proves to conflict with mandatory consumer or transport
        law, that provision does not apply. The remaining terms then remain fully in force.
      </p>

      <h3 className={H3}>Our insurance</h3>
      <p className={P}>
        We carry you in a vehicle that is insured for passenger transport for payment. If you
        would like to know what that means in a specific case, we will explain it on request.
      </p>

      <h2 className={H2}>10 · Complaints and applicable law</h2>
      <p className={P}>
        You can submit complaints via{" "}
        <a className="underline" href={`mailto:${BEDRIJF.email}`}>
          {BEDRIJF.email}
        </a>{" "}
        or {BEDRIJF.telefoon}. Dutch law applies to these terms.
      </p>

      <p className="mt-12 border-t border-line pt-6 text-sm text-secondary">
        See also our{" "}
        <Link href="/privacy" className="underline">
          privacy statement
        </Link>
        .
      </p>
    </article>
  );
}
