import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo-locale";
import {
  BEDRIJF,
  getVerwerkers,
  getGegevens,
  getBewaartermijnen,
  getLaatstBijgewerkt,
} from "@/lib/legal";

/**
 * Privacyverklaring.
 *
 * ── CONCEPT — JURIDISCHE TOETSING VEREIST ──────────────────────────────────
 *
 * Deze tekst beschrijft feitelijk correct wat het systeem daadwerkelijk doet: welke
 * gegevens het boekingsformulier verzamelt, waar ze worden opgeslagen en welke
 * verwerkers ze ontvangen. Dat is geverifieerd tegen de codebase, niet overgenomen
 * uit een sjabloon.
 *
 * Wat hier NIET in zit en wel geregeld moet worden vóór livegang:
 *   · verwerkersovereenkomsten met Supabase, Resend, Google en Vercel;
 *   · definitieve bewaartermijnen — alleen de fiscale 7 jaar volgt uit de wet, de
 *     rest is een keuze van de eigenaar en staat zichtbaar gemarkeerd open;
 *   · toetsing door een jurist.
 *
 * De Engelse versie (stap 6) is een gemaksvertaling van EXACT deze Nederlandse
 * bron; bij tegenstrijdigheid prevaleert het Nederlands (disclaimer bovenaan de
 * Engelse variant). Publiceer geen van beide als definitieve juridische tekst
 * zonder die toetsing.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "/privacy", "privacyTitle", "privacyDesc");
}

const H2 = "mt-10 font-display text-xl font-bold text-ink";
const P = "mt-3 text-secondary";

/** Vaste Engelse gemaksvertaling-disclaimer bovenaan de EN-pagina. */
const EN_DISCLAIMER =
  "This English version is provided for convenience. In the event of any inconsistency, the Dutch version shall prevail.";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return locale === "en" ? <PrivacyEN /> : <PrivacyNL />;
}

function PrivacyNL() {
  const gegevens = getGegevens("nl");
  const verwerkers = getVerwerkers("nl");
  const bewaartermijnen = getBewaartermijnen("nl");

  return (
    <article className="mx-auto max-w-[720px] px-6 py-16 md:py-24">
      <p className="text-eyebrow font-medium uppercase text-accent">Juridisch</p>
      <h1 className="mt-4 font-display text-display-lg font-bold text-ink">Privacyverklaring</h1>
      <p className="mt-4 text-secondary">
        Laatst bijgewerkt op {getLaatstBijgewerkt("nl")}. Deze verklaring beschrijft hoe{" "}
        {BEDRIJF.rechtspersoon}, handelend onder de naam {BEDRIJF.handelsnaam}, omgaat met
        uw persoonsgegevens wanneer u onze website gebruikt of een rit boekt.
      </p>

      <h2 className={H2}>Wie is verantwoordelijk</h2>
      <p className={P}>
        {BEDRIJF.rechtspersoon} te {BEDRIJF.vestigingsplaats}, {BEDRIJF.land}.
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
        <br />
        E-mail: <a className="underline" href={`mailto:${BEDRIJF.email}`}>{BEDRIJF.email}</a>
        <br />
        Telefoon: <a className="underline" href={BEDRIJF.telefoonHref}>{BEDRIJF.telefoon}</a>
      </p>

      <h2 className={H2}>Welke gegevens wij verzamelen</h2>
      <p className={P}>
        Wanneer u een rit boekt, vragen wij uitsluitend wat nodig is om die rit uit te
        voeren en te bevestigen:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-secondary">
        {gegevens.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <p className={P}>
        Daarnaast leggen wij prijsaanvragen vast — de opgegeven herkomst, bestemming en de
        berekende prijs — om onze tarieven te kunnen controleren. Online betalingen worden
        in een beveiligd Stripe-betaalveld verwerkt. T4XI ontvangt of bewaart geen volledige
        kaartgegevens; wij bewaren wel het bedrag, de betaalstatus en technische
        betaalreferenties die nodig zijn voor bevestiging, terugbetaling en administratie.
      </p>

      <h2 className={H2}>Waarvoor wij ze gebruiken</h2>
      <p className={P}>
        Voor het uitvoeren van de vervoersovereenkomst: het inplannen van uw rit, het
        bevestigen daarvan per e-mail of WhatsApp, en contact opnemen als er iets wijzigt.
        Geeft u een vluchtnummer op, dan gebruiken wij dat om uw vluchtstatus te volgen en
        het ophaalmoment aan te passen bij vertraging.
      </p>
      <p className={P}>
        De grondslag is de uitvoering van de overeenkomst met u. Wij gebruiken uw gegevens
        niet voor advertenties en verkopen ze niet aan derden.
      </p>
      <p className={P}>
        Gegevens uit een membership-, zakelijke, hotel- of partneraanvraag gebruiken wij
        uitsluitend om die aanvraag te beoordelen, contact op te nemen en afspraken vast te
        leggen. Betalingsgegevens gebruiken wij om de betaling uit te voeren, fraude te
        voorkomen en onze financiële administratie te voeren.
      </p>

      <h2 className={H2}>Met wie wij ze delen</h2>
      <p className={P}>
        Wij gebruiken de volgende dienstverleners en ontvangers. Afhankelijk van de dienst
        handelen zij als verwerker namens ons of als zelfstandig verwerkingsverantwoordelijke:
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-[0.1em] text-stone">
              <th className="py-2 pr-4 font-medium">Partij</th>
              <th className="py-2 pr-4 font-medium">Doel</th>
              <th className="py-2 font-medium">Regio</th>
            </tr>
          </thead>
          <tbody>
            {verwerkers.map((v) => (
              <tr key={v.naam} className="border-b border-line">
                <td className="py-2.5 pr-4 font-medium text-ink">{v.naam}</td>
                <td className="py-2.5 pr-4 text-secondary">{v.doel}</td>
                <td className="py-2.5 text-secondary">{v.regio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={P}>
        Daarnaast delen wij uw naam, ophaaladres en tijdstip met de chauffeur die uw rit
        uitvoert. Dat is nodig om u te kunnen ophalen.
      </p>

      <h2 className={H2}>Op welke grondslag</h2>
      <p className={P}>
        Voor het uitvoeren en bevestigen van uw rit verwerken wij uw gegevens op grond van
        de <strong>uitvoering van de overeenkomst</strong> met u. Voor de bedragen die op
        onze facturen terechtkomen geldt een <strong>wettelijke verplichting</strong>: de
        fiscale bewaarplicht. Voor het vastleggen van prijsaanvragen beroepen wij ons op ons{" "}
        <strong>gerechtvaardigd belang</strong> om te kunnen controleren of onze tarieven
        kloppen — daar zit geen naam of contactgegeven bij.
      </p>

      <h2 className={H2}>Hoe lang wij ze bewaren</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-[0.1em] text-stone">
              <th className="py-2 pr-4 font-medium">Gegevens</th>
              <th className="py-2 pr-4 font-medium">Bewaartermijn</th>
              <th className="py-2 font-medium">Waarom</th>
            </tr>
          </thead>
          <tbody>
            {bewaartermijnen.map((rij) => (
              <tr key={rij.gegevens} className="border-b border-line">
                <td className="py-2.5 pr-4 font-medium text-ink">{rij.gegevens}</td>
                <td className="py-2.5 pr-4 tabular-nums text-secondary">{rij.termijn}</td>
                <td className="py-2.5 text-secondary">{rij.reden}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={P}>
        Na afloop van een termijn verwijderen wij de gegevens of maken wij ze onherleidbaar,
        tenzij een wettelijke verplichting ons tot langer bewaren verplicht. Het vluchtnummer
        bewaren wij korter dan de boeking zelf: het is alleen nodig om u op te halen en heeft
        daarna geen functie meer.
      </p>
      <p className={P}>
        Wij versturen geen nieuwsbrief en houden geen mailinglijst bij. Er is daarom geen
        bewaartermijn voor marketingcommunicatie.
      </p>

      <h2 className={H2}>Cookies</h2>
      <p className={P}>
        Deze website plaatst zelf geen tracking- of advertentiecookies en gebruikt geen
        analysesoftware die u over websites heen volgt. Voor de betaalstap kan Stripe strikt
        noodzakelijke beveiligings- en fraudepreventietechnieken gebruiken. Gaan wij later
        niet-noodzakelijke analyse- of marketingcookies gebruiken, dan vragen wij vooraf uw
        toestemming.
      </p>

      <h2 className={H2}>Uw rechten</h2>
      <p className={P}>
        U heeft het recht uw gegevens in te zien, te laten corrigeren of te laten
        verwijderen, en om bezwaar te maken tegen de verwerking. Stuur daarvoor een bericht
        naar <a className="underline" href={`mailto:${BEDRIJF.email}`}>{BEDRIJF.email}</a>.
        Wij reageren binnen vier weken.
      </p>
      <p className={P}>
        Bent u het niet eens met hoe wij met uw gegevens omgaan, dan kunt u een klacht
        indienen bij de Autoriteit Persoonsgegevens.
      </p>

      <h2 className={H2}>Beveiliging</h2>
      <p className={P}>
        Onze website is uitsluitend via een beveiligde verbinding bereikbaar. Gegevens
        worden opgeslagen in een omgeving met toegangscontrole, en alleen medewerkers die
        uw rit uitvoeren of afhandelen hebben toegang tot uw boeking.
      </p>

      <p className="mt-12 border-t border-line pt-6 text-sm text-secondary">
        Zie ook onze{" "}
        <Link href="/voorwaarden" className="underline">
          algemene voorwaarden
        </Link>
        .
      </p>
    </article>
  );
}

function PrivacyEN() {
  const gegevens = getGegevens("en");
  const verwerkers = getVerwerkers("en");
  const bewaartermijnen = getBewaartermijnen("en");

  return (
    <article className="mx-auto max-w-[720px] px-6 py-16 md:py-24">
      <p className="text-eyebrow font-medium uppercase text-accent">Legal</p>
      <h1 className="mt-4 font-display text-display-lg font-bold text-ink">Privacy statement</h1>
      <p className="mt-4 rounded-lg border border-line bg-fog px-4 py-3 text-sm text-secondary">
        {EN_DISCLAIMER}
      </p>
      <p className="mt-4 text-secondary">
        Last updated on {getLaatstBijgewerkt("en")}. This statement describes how{" "}
        {BEDRIJF.rechtspersoon}, trading under the name {BEDRIJF.handelsnaam}, handles your
        personal data when you use our website or book a ride.
      </p>

      <h2 className={H2}>Who is responsible</h2>
      <p className={P}>
        {BEDRIJF.rechtspersoon} in {BEDRIJF.vestigingsplaats}, the Netherlands.
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
        <br />
        Email: <a className="underline" href={`mailto:${BEDRIJF.email}`}>{BEDRIJF.email}</a>
        <br />
        Phone: <a className="underline" href={BEDRIJF.telefoonHref}>{BEDRIJF.telefoon}</a>
      </p>

      <h2 className={H2}>What data we collect</h2>
      <p className={P}>
        When you book a ride, we ask only for what is needed to carry out and confirm that
        ride:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-secondary">
        {gegevens.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <p className={P}>
        In addition, we record price requests — the origin and destination you enter and the
        calculated price — so that we can verify our rates. Online payments are processed in
        a secure Stripe payment field. T4XI does not receive or store full card details; we do
        store the amount, payment status and technical payment references needed for
        confirmation, refunds and accounting.
      </p>

      <h2 className={H2}>What we use it for</h2>
      <p className={P}>
        To perform the transport agreement: scheduling your ride, confirming it by email or
        WhatsApp, and contacting you if anything changes. If you provide a flight number, we
        use it to track your flight status and adjust the pick-up time in the event of a
        delay.
      </p>
      <p className={P}>
        The legal basis is the performance of the agreement with you. We do not use your data
        for advertising and do not sell it to third parties.
      </p>
      <p className={P}>
        We use details from membership, business, hotel or partner requests only to assess
        the request, contact you and document agreed arrangements. We use payment data to
        process the payment, prevent fraud and maintain our financial records.
      </p>

      <h2 className={H2}>Who we share it with</h2>
      <p className={P}>
        We use the following service providers and recipients. Depending on the service,
        they act either as a processor on our behalf or as an independent controller:
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-[0.1em] text-stone">
              <th className="py-2 pr-4 font-medium">Party</th>
              <th className="py-2 pr-4 font-medium">Purpose</th>
              <th className="py-2 font-medium">Region</th>
            </tr>
          </thead>
          <tbody>
            {verwerkers.map((v) => (
              <tr key={v.naam} className="border-b border-line">
                <td className="py-2.5 pr-4 font-medium text-ink">{v.naam}</td>
                <td className="py-2.5 pr-4 text-secondary">{v.doel}</td>
                <td className="py-2.5 text-secondary">{v.regio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={P}>
        We also share your name, pick-up address and time with the driver who carries out
        your ride. That is necessary in order to collect you.
      </p>

      <h2 className={H2}>On what legal basis</h2>
      <p className={P}>
        To carry out and confirm your ride, we process your data on the basis of the{" "}
        <strong>performance of the agreement</strong> with you. For the amounts that appear on
        our invoices, a <strong>legal obligation</strong> applies: the statutory tax retention
        obligation. For recording price requests, we rely on our{" "}
        <strong>legitimate interest</strong> in being able to verify that our rates are
        correct — this involves no name or contact details.
      </p>

      <h2 className={H2}>How long we keep it</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-[0.1em] text-stone">
              <th className="py-2 pr-4 font-medium">Data</th>
              <th className="py-2 pr-4 font-medium">Retention period</th>
              <th className="py-2 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {bewaartermijnen.map((rij) => (
              <tr key={rij.gegevens} className="border-b border-line">
                <td className="py-2.5 pr-4 font-medium text-ink">{rij.gegevens}</td>
                <td className="py-2.5 pr-4 tabular-nums text-secondary">{rij.termijn}</td>
                <td className="py-2.5 text-secondary">{rij.reden}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={P}>
        Once a period ends, we delete the data or render it untraceable, unless a legal
        obligation requires us to keep it longer. We keep the flight number for a shorter time
        than the booking itself: it is only needed to collect you and has no function
        afterwards.
      </p>
      <p className={P}>
        We do not send a newsletter and do not keep a mailing list. There is therefore no
        retention period for marketing communications.
      </p>

      <h2 className={H2}>Cookies</h2>
      <p className={P}>
        This website itself places no tracking or advertising cookies and uses no analytics
        software that follows you across websites. During payment, Stripe may use strictly
        necessary security and fraud-prevention technologies. If we later use non-essential
        analytics or marketing cookies, we will ask for your consent in advance.
      </p>

      <h2 className={H2}>Your rights</h2>
      <p className={P}>
        You have the right to access your data, to have it corrected or deleted, and to object
        to the processing. To do so, send a message to{" "}
        <a className="underline" href={`mailto:${BEDRIJF.email}`}>{BEDRIJF.email}</a>. We
        respond within four weeks.
      </p>
      <p className={P}>
        If you disagree with how we handle your data, you can file a complaint with the Dutch
        Data Protection Authority (Autoriteit Persoonsgegevens).
      </p>

      <h2 className={H2}>Security</h2>
      <p className={P}>
        Our website is accessible only over a secure connection. Data is stored in an
        environment with access control, and only staff who carry out or handle your ride have
        access to your booking.
      </p>

      <p className="mt-12 border-t border-line pt-6 text-sm text-secondary">
        See also our{" "}
        <Link href="/voorwaarden" className="underline">
          terms and conditions
        </Link>
        .
      </p>
    </article>
  );
}
