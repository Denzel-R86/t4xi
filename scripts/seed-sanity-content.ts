import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { SanityDocumentStub } from "@sanity/client";
import { getCliClient } from "sanity/cli";
import type {
  ActionLink,
  FleetPage,
  SectionIntro,
  Seo,
  ServicesPage,
  Vehicle,
} from "../sanity/generated/types";

type SeedDocument<T extends { _type: string }> = Omit<
  T,
  "_id" | "_rev" | "_createdAt" | "_updatedAt"
> & { _id: string };

const client = getCliClient({ apiVersion: "2026-08-09" });
const documentIds = [
  "servicesPage-nl",
  "servicesPage-en",
  "fleetPage-nl",
  "fleetPage-en",
] as const;
const protectedDocumentIds = documentIds.flatMap((id) => [id, `drafts.${id}`]);

const fleetAssetFiles = {
  teslaExterior: "public/tesla_model_y_black.jpg",
  teslaInterior: "public/tesla-interieur.jpg",
  lynkExterior: "public/lynk_co_black.jpg",
  lynkInterior: "public/t4xi-campagne-03-comfort.png",
} as const;

const action = (label: string, href: string, accessibleLabel?: string): ActionLink => ({
  _type: "actionLink",
  label,
  href,
  ...(accessibleLabel ? { accessibleLabel } : {}),
});

const intro = (
  eyebrow: string,
  headline: string,
  headlineConclusion: string,
  introduction: string,
): SectionIntro => ({
  _type: "sectionIntro",
  eyebrow,
  headline,
  headlineConclusion,
  introduction,
});

const seo = (metaTitle: string, metaDescription: string): Seo => ({
  _type: "seo",
  metaTitle,
  metaDescription,
});

const servicesDocuments = [
  {
    _id: "servicesPage-nl",
    _type: "servicesPage",
    language: "nl",
    intro: intro(
      "Onze diensten",
      "Voor elke rit",
      "de juiste service",
      "Van een stipte Schipholtransfer tot representatief zakelijk vervoer: iedere rit krijgt dezelfde rustige service, heldere afspraken en vaste prijs vooraf.",
    ),
    services: [
      {
        _key: "airport",
        _type: "serviceCard",
        serviceType: "airport",
        title: "Schiphol transfer",
        summary:
          "Vaste prijs, vluchtmonitoring en ophalen bij aankomst. Nooit meer stress op de luchthaven.",
        benefits: ["Vluchtmonitoring", "Vaste prijs", "24/7"],
        action: action("Boek transfer", "/boeken", "Boek een Schipholtransfer"),
      },
      {
        _key: "business",
        _type: "serviceCard",
        serviceType: "business",
        title: "Zakelijk vervoer",
        summary:
          "Facturering, vaste chauffeur en maandelijkse contracten. Professioneel van deur tot deur.",
        benefits: ["Factuur op rekening", "Vaste chauffeur", "Maandcontract"],
        action: action("Meer info", "/contact", "Neem contact op over zakelijk vervoer"),
      },
      {
        _key: "private",
        _type: "serviceCard",
        serviceType: "private",
        title: "Privéritten",
        summary:
          "Naar een diner, evenement of afspraak. Stijlvol vervoer voor elke gelegenheid.",
        benefits: ["Directe boeking", "Vaste prijs vooraf", "Transparante prijs"],
        action: action("Nu boeken", "/boeken", "Boek een privérit"),
      },
      {
        _key: "event",
        _type: "serviceCard",
        serviceType: "event",
        title: "Evenementen",
        summary:
          "Bruiloften, gala's en bedrijfsevents. Meerdere voertuigen, één aanspreekpunt.",
        benefits: ["Meerdere voertuigen", "Persoonlijk contact", "Maatwerk"],
        action: action("Offerte aanvragen", "/contact", "Vraag een offerte voor evenementenvervoer aan"),
      },
    ],
    assurancesIntro: intro(
      "Waarom T4XI",
      "Kwaliteit die",
      "u voelt",
      "Van vluchtmonitoring tot een verzorgde auto en transparante ritprijs: deze vier afspraken vormen de vaste kwaliteitsbasis van iedere T4XI-rit.",
    ),
    assurances: [
      {
        _key: "flight",
        _type: "assurance",
        assuranceType: "flight",
        title: "Wij volgen uw vlucht",
        explanation:
          "Vertraagd? Wij volgen uw vluchtstatus en passen het ophaalmoment aan. Na de landing is 60 minuten wachttijd inbegrepen.",
      },
      {
        _key: "fleet",
        _type: "assurance",
        assuranceType: "fleet",
        title: "Luxe voertuigen",
        explanation:
          "Tesla Model Y en Lynk & Co 01. Geen standaard taxi — premium comfort voor elke rit.",
      },
      {
        _key: "drivers",
        _type: "assurance",
        assuranceType: "drivers",
        title: "Professionele chauffeurs",
        explanation:
          "Uw chauffeur beschikt over een geldige Nederlandse taxichauffeurskaart. Discreet, ervaren en representatief.",
      },
      {
        _key: "pricing",
        _type: "assurance",
        assuranceType: "pricing",
        title: "Transparante tarieven",
        explanation:
          "Vaste prijs vóór de rit. Geen taxameter, bagage vooraf zichtbaar afgestemd en geen verborgen kosten.",
      },
    ],
    business: {
      _type: "businessSection",
      intro: intro(
        "Voor bedrijven",
        "T4XI voor",
        "zakelijke klanten",
        "Van maandelijkse contracten tot eenmalige boardroomritten. T4XI biedt bedrijven een betrouwbare, representatieve mobiliteitsoplossing met volledige ontzorging.",
      ),
      benefits: [
        {
          _key: "invoicing",
          _type: "businessBenefit",
          title: "Facturatie op rekening",
          explanation: "Maandelijkse factuur, zonder losse declaraties.",
        },
        {
          _key: "driver",
          _type: "businessBenefit",
          title: "Vaste chauffeur",
          explanation: "Uw medewerkers kennen hun chauffeur persoonlijk.",
        },
        {
          _key: "monthly",
          _type: "businessBenefit",
          title: "Maandelijkse ritten",
          explanation: "Volumekorting vanaf tien ritten per maand.",
        },
        {
          _key: "account",
          _type: "businessBenefit",
          title: "Zakelijk account",
          explanation: "Ritoverzicht, centrale facturatie en directe support.",
        },
      ],
      accountTitle: "Zakelijk account",
      accountFeatures: [
        "Maandelijkse factuur",
        "Dedicated chauffeur",
        "Ritregistratie & overzicht",
        "24/7 prioriteitssupport",
        "Volumekorting",
        "Onbeperkte ritten",
      ],
      primaryAction: action("Neem contact op", "/contact", "Neem contact op over zakelijk vervoer"),
      accountAction: action(
        "Vraag zakelijk account aan",
        "/contact",
        "Vraag een zakelijk T4XI-account aan",
      ),
    },
    seo: seo(
      "Premium taxi- en chauffeursdiensten",
      "Schiphol transfers, zakelijk vervoer, privéritten en evenementen — premium vervoer met een moderne, emissiebewuste vloot en vaste prijzen vooraf.",
    ),
  },
  {
    _id: "servicesPage-en",
    _type: "servicesPage",
    language: "en",
    intro: intro(
      "Our services",
      "The right service",
      "for every ride",
      "From punctual Schiphol transfers to executive business travel: every journey comes with calm service, clear agreements and a fixed fare up front.",
    ),
    services: [
      {
        _key: "airport",
        _type: "serviceCard",
        serviceType: "airport",
        title: "Schiphol transfer",
        summary:
          "A fixed fare, flight monitoring and pick-up on arrival. No more airport stress.",
        benefits: ["Flight monitoring", "Fixed fare", "24/7"],
        action: action("Book transfer", "/boeken", "Book a Schiphol airport transfer"),
      },
      {
        _key: "business",
        _type: "serviceCard",
        serviceType: "business",
        title: "Business travel",
        summary:
          "Invoiced billing, a dedicated driver and monthly contracts. Professional, door to door.",
        benefits: ["Invoiced billing", "Dedicated driver", "Monthly contract"],
        action: action("Learn more", "/contact", "Contact T4XI about business travel"),
      },
      {
        _key: "private",
        _type: "serviceCard",
        serviceType: "private",
        title: "Private rides",
        summary:
          "Travel to dinner, an event or an appointment in composed comfort for every occasion.",
        benefits: ["Instant booking", "Fixed fare up front", "Transparent pricing"],
        action: action("Book now", "/boeken", "Book a private T4XI ride"),
      },
      {
        _key: "event",
        _type: "serviceCard",
        serviceType: "event",
        title: "Events",
        summary:
          "Weddings, galas and corporate events. Multiple vehicles with one point of contact.",
        benefits: ["Multiple vehicles", "Personal contact", "Tailor-made"],
        action: action("Request a quote", "/contact", "Request an event transport quote"),
      },
    ],
    assurancesIntro: intro(
      "Why T4XI",
      "Quality you",
      "can feel",
      "From flight monitoring to an immaculate car and transparent fare, four clear commitments form the quality baseline for every T4XI ride.",
    ),
    assurances: [
      {
        _key: "flight",
        _type: "assurance",
        assuranceType: "flight",
        title: "We track your flight",
        explanation:
          "Delayed? We monitor your flight status and adjust the pick-up time. Sixty minutes of waiting time is included after landing.",
      },
      {
        _key: "fleet",
        _type: "assurance",
        assuranceType: "fleet",
        title: "Premium vehicles",
        explanation:
          "Tesla Model Y and Lynk & Co 01. Not a standard taxi — premium comfort on every ride.",
      },
      {
        _key: "drivers",
        _type: "assurance",
        assuranceType: "drivers",
        title: "Professional drivers",
        explanation:
          "Your driver holds a valid Dutch taxi licence and is discreet, experienced and well-presented.",
      },
      {
        _key: "pricing",
        _type: "assurance",
        assuranceType: "pricing",
        title: "Transparent fares",
        explanation:
          "A fixed fare before the ride, no meter, luggage clearly agreed in advance and no hidden costs.",
      },
    ],
    business: {
      _type: "businessSection",
      intro: intro(
        "For companies",
        "T4XI for",
        "business clients",
        "From monthly contracts to one-off boardroom journeys, T4XI gives companies reliable, representative mobility with every practical detail taken care of.",
      ),
      benefits: [
        {
          _key: "invoicing",
          _type: "businessBenefit",
          title: "Invoiced billing",
          explanation: "One monthly invoice, without individual expense claims.",
        },
        {
          _key: "driver",
          _type: "businessBenefit",
          title: "Dedicated driver",
          explanation: "Your team knows its driver personally.",
        },
        {
          _key: "monthly",
          _type: "businessBenefit",
          title: "Monthly rides",
          explanation: "Volume discount from ten rides per month.",
        },
        {
          _key: "account",
          _type: "businessBenefit",
          title: "Business account",
          explanation: "Journey overview, central billing and direct support.",
        },
      ],
      accountTitle: "Business account",
      accountFeatures: [
        "Monthly invoice",
        "Dedicated driver",
        "Journey log & overview",
        "24/7 priority support",
        "Volume discount",
        "Unlimited rides",
      ],
      primaryAction: action("Get in touch", "/contact", "Contact T4XI about business travel"),
      accountAction: action(
        "Request a business account",
        "/contact",
        "Request a T4XI business account",
      ),
    },
    seo: seo(
      "Premium taxi and chauffeur services",
      "Schiphol transfers, business travel, private rides and events — premium transport with a modern, emissions-conscious fleet and fixed fares up front.",
    ),
  },
] satisfies SeedDocument<ServicesPage>[];

type AssetDocument = { _id: string };

function editorialImage(asset: AssetDocument, alt: string): Vehicle["exteriorImage"] {
  return {
    _type: "editorialImage",
    asset: { _type: "reference", _ref: asset._id },
    alt,
  };
}

async function uploadFleetAssets() {
  const upload = async (relativePath: string): Promise<AssetDocument> => {
    const absolutePath = resolve(process.cwd(), relativePath);
    return client.assets.upload("image", createReadStream(absolutePath), {
      filename: relativePath.split("/").at(-1),
    });
  };

  const [teslaExterior, teslaInterior, lynkExterior, lynkInterior] = await Promise.all([
    upload(fleetAssetFiles.teslaExterior),
    upload(fleetAssetFiles.teslaInterior),
    upload(fleetAssetFiles.lynkExterior),
    upload(fleetAssetFiles.lynkInterior),
  ]);

  return { teslaExterior, teslaInterior, lynkExterior, lynkInterior };
}

async function verifyFleetAssetFiles() {
  await Promise.all(
    Object.values(fleetAssetFiles).map((relativePath) =>
      access(resolve(process.cwd(), relativePath)),
    ),
  );
}

function fleetDocuments(assets: Awaited<ReturnType<typeof uploadFleetAssets>>) {
  return [
    {
      _id: "fleetPage-nl",
      _type: "fleetPage",
      language: "nl",
      intro: intro(
        "Ons wagenpark — twee modellen, één standaard",
        "Twee modellen.",
        "Eén serviceniveau.",
        "Tesla Model Y en Lynk & Co 01. Welk model voorrijdt hangt af van planning en beschikbaarheid; comfort, verzorging en service blijven gelijk.",
      ),
      vehicles: [
        {
          _key: "tesla-model-y",
          _type: "vehicle",
          modelName: "Tesla Model Y",
          powertrain: "Volledig elektrisch",
          description: "Ruim, stil en minimalistisch afgewerkt voor een ontspannen rit.",
          attributes: ["Volledig elektrisch", "Stil en ruim", "Minimalistisch interieur"],
          exteriorImage: editorialImage(
            assets.teslaExterior,
            "Zwarte Tesla Model Y van buiten, schuin van voren gefotografeerd",
          ),
          interiorImage: editorialImage(
            assets.teslaInterior,
            "Interieur van de Tesla Model Y met middenconsole en voorstoelen",
          ),
          interiorImageType: "modelSpecific",
        },
        {
          _key: "lynk-co-01",
          _type: "vehicle",
          modelName: "Lynk & Co 01",
          powertrain: "Plug-in hybride",
          description: "Een ruime SUV met panoramadak en een comfortabel afgewerkt interieur.",
          attributes: ["Plug-in hybride", "Panoramadak", "Ruime achterbank"],
          exteriorImage: editorialImage(
            assets.lynkExterior,
            "Zwarte Lynk & Co 01 van buiten, schuin van voren gefotografeerd",
          ),
          interiorImage: editorialImage(
            assets.lynkInterior,
            "Sfeerbeeld van interieurcomfort met achterbank, armsteun en oplaadmogelijkheid",
          ),
          interiorImageType: "mood",
          moodImageDisclosure: "Representatief sfeerbeeld; uitvoering kan afwijken.",
        },
      ],
      availabilityNote: "Het ingezette model is afhankelijk van planning en beschikbaarheid.",
      servicePromise: "Dezelfde verzorgde T4XI-service in iedere rit.",
      action: action("Boek uw rit", "/boeken", "Boek een rit met T4XI"),
      seo: seo(
        "Premium wagenpark: Tesla en Lynk & Co",
        "Bekijk het T4XI-wagenpark met Tesla Model Y en Lynk & Co 01: twee ruime, stille voertuigen met één vast premium serviceniveau.",
      ),
    },
    {
      _id: "fleetPage-en",
      _type: "fleetPage",
      language: "en",
      intro: intro(
        "Our fleet — two models, one standard",
        "Two models.",
        "One service standard.",
        "Tesla Model Y and Lynk & Co 01. The assigned model depends on planning and availability; comfort, presentation and service remain the same.",
      ),
      vehicles: [
        {
          _key: "tesla-model-y",
          _type: "vehicle",
          modelName: "Tesla Model Y",
          powertrain: "Fully electric",
          description: "Spacious, quiet and minimally finished for a relaxed journey.",
          attributes: ["Fully electric", "Quiet and spacious", "Minimal interior"],
          exteriorImage: editorialImage(
            assets.teslaExterior,
            "Black Tesla Model Y exterior, photographed from the front three-quarter angle",
          ),
          interiorImage: editorialImage(
            assets.teslaInterior,
            "Tesla Model Y interior with centre display and front seats",
          ),
          interiorImageType: "modelSpecific",
        },
        {
          _key: "lynk-co-01",
          _type: "vehicle",
          modelName: "Lynk & Co 01",
          powertrain: "Plug-in hybrid",
          description: "A spacious SUV with a panoramic roof and a comfortably finished interior.",
          attributes: ["Plug-in hybrid", "Panoramic roof", "Spacious rear seats"],
          exteriorImage: editorialImage(
            assets.lynkExterior,
            "Black Lynk & Co 01 exterior, photographed from the front three-quarter angle",
          ),
          interiorImage: editorialImage(
            assets.lynkInterior,
            "Mood image of rear-seat comfort, armrest and in-car charging",
          ),
          interiorImageType: "mood",
          moodImageDisclosure: "Representative mood image; the exact trim may differ.",
        },
      ],
      availabilityNote: "The assigned model depends on planning and availability.",
      servicePromise: "The same composed T4XI service on every ride.",
      action: action("Book your ride", "/boeken", "Book a ride with T4XI"),
      seo: seo(
        "Premium fleet: Tesla and Lynk & Co",
        "Explore the T4XI fleet with Tesla Model Y and Lynk & Co 01: two spacious, quiet vehicles backed by one consistent premium service standard.",
      ),
    },
  ] satisfies SeedDocument<FleetPage>[];
}

async function main() {
  const existing = await client.fetch<string[]>(
    `*[_id in $ids]._id`,
    { ids: protectedDocumentIds },
  );
  if (existing.length > 0) {
    throw new Error(
      `Import gestopt: deze CMS-documenten bestaan al en worden niet overschreven: ${existing.join(", ")}`,
    );
  }

  if (process.argv.includes("--dry-run")) {
    await verifyFleetAssetFiles();
    console.log(
      `ID- en bronbestandscontrole geslaagd: ${documentIds.length} nieuwe documenten kunnen veilig worden voorbereid.`,
    );
    return;
  }

  const assets = await uploadFleetAssets();
  const documents: SanityDocumentStub[] = [
    ...servicesDocuments,
    ...fleetDocuments(assets),
  ];
  let transaction = client.transaction();
  for (const document of documents) transaction = transaction.create(document);
  await transaction.commit({ visibility: "sync" });

  console.log(`CMS-import voltooid: ${documents.map((document) => document._id).join(", ")}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "De CMS-import is mislukt.");
  process.exitCode = 1;
});
