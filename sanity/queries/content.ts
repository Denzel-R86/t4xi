import { defineQuery } from "next-sanity";

const IMAGE_PROJECTION = `{
  alt,
  caption,
  credit,
  crop,
  hotspot,
  "asset": asset->{
    _id,
    url,
    metadata{
      lqip,
      dimensions{width, height}
    }
  }
}`;

const ACTION_PROJECTION = `{
  label,
  href,
  accessibleLabel
}`;

const INTRO_PROJECTION = `{
  eyebrow,
  headline,
  headlineConclusion,
  introduction
}`;

const SEO_PROJECTION = `{
  metaTitle,
  metaDescription,
  "shareImage": shareImage ${IMAGE_PROJECTION}
}`;

export const SERVICES_PAGE_QUERY = defineQuery(`
  *[_type == "servicesPage" && _id == "servicesPage-" + $locale][0]{
    _id,
    language,
    "intro": intro ${INTRO_PROJECTION},
    services[]{
      _key,
      serviceType,
      title,
      summary,
      benefits,
      "action": action ${ACTION_PROJECTION}
    },
    "assurancesIntro": assurancesIntro ${INTRO_PROJECTION},
    assurances[]{
      _key,
      assuranceType,
      title,
      explanation
    },
    business{
      "intro": intro ${INTRO_PROJECTION},
      benefits[]{_key, title, explanation},
      accountTitle,
      accountFeatures,
      "primaryAction": primaryAction ${ACTION_PROJECTION},
      "accountAction": accountAction ${ACTION_PROJECTION}
    },
    "seo": seo ${SEO_PROJECTION}
  }
`);

export const FLEET_PAGE_QUERY = defineQuery(`
  *[_type == "fleetPage" && _id == "fleetPage-" + $locale][0]{
    _id,
    language,
    "intro": intro ${INTRO_PROJECTION},
    vehicles[]{
      _key,
      modelName,
      powertrain,
      description,
      attributes,
      "exteriorImage": exteriorImage ${IMAGE_PROJECTION},
      "interiorImage": interiorImage ${IMAGE_PROJECTION},
      interiorImageType,
      moodImageDisclosure
    },
    availabilityNote,
    servicePromise,
    "action": action ${ACTION_PROJECTION},
    "seo": seo ${SEO_PROJECTION}
  }
`);
