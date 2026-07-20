import type { Metadata } from "next";
import Link from "next/link";
import { BEDRIJF, VERWERKERS, GEGEVENS, LAATST_BIJGEWERKT } from "@/lib/legal";

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
 *   · een definitieve bewaartermijn, vastgesteld door de eigenaar;
 *   · toetsing door een jurist.
 *
 * Publiceer deze pagina niet als definitieve juridische tekst zonder die toetsing.
 */

export const metadata: Metadata = {
  title: "Privacyverklaring",
  description:
    "Hoe T4XI omgaat met uw persoonsgegevens: welke gegevens wij verzamelen bij een " +
    "boeking, waarvoor wij ze gebruiken en met welke partijen wij ze delen.",
  alternates: { canonical: "/privacy" },
};

const H2 = "mt-10 font-display text-xl font-bold text-ink";
const P = "mt-3 text-secondary";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-16 md:py-24">
      <p className="text-eyebrow font-medium uppercase text-accent">Juridisch</p>
      <h1 className="mt-4 font-display text-display-lg font-bold text-ink">Privacyverklaring</h1>
      <p className="mt-4 text-secondary">
        Laatst bijgewerkt op {LAATST_BIJGEWERKT}. Deze verklaring beschrijft hoe{" "}
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
        {GEGEVENS.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <p className={P}>
        Daarnaast leggen wij prijsaanvragen vast — de opgegeven herkomst, bestemming en de
        berekende prijs — om onze tarieven te kunnen controleren. Wij vragen geen
        betaalgegevens via deze website en slaan die dus ook niet op.
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

      <h2 className={H2}>Met wie wij ze delen</h2>
      <p className={P}>
        Wij schakelen dienstverleners in die namens ons gegevens verwerken. Zij mogen die
        uitsluitend gebruiken voor het doel waarvoor wij ze inschakelen:
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
            {VERWERKERS.map((v) => (
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

      <h2 className={H2}>Hoe lang wij ze bewaren</h2>
      <p className={P}>
        Boekingsgegevens bewaren wij zolang dat nodig is voor de uitvoering van de rit en
        de administratieve afhandeling daarvan. Voor gegevens die op onze facturen staan
        geldt de wettelijke fiscale bewaarplicht van zeven jaar. Prijsaanvragen zonder
        boeking bewaren wij korter, omdat daar geen overeenkomst uit voortkomt.
      </p>

      <h2 className={H2}>Cookies</h2>
      <p className={P}>
        Deze website plaatst geen tracking- of advertentiecookies en gebruikt geen
        analysesoftware die u over websites heen volgt. Er is daarom geen cookiebanner.
        Gaan wij dat in de toekomst wel doen, dan vragen wij daar vooraf uw toestemming
        voor.
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
    </main>
  );
}
