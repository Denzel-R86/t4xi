import type {
  FLEET_PAGE_QUERY_RESULT,
  SERVICES_PAGE_QUERY_RESULT,
} from "@/sanity/generated/types";

type GeneratedServicesPage = NonNullable<SERVICES_PAGE_QUERY_RESULT>;
type GeneratedFleetPage = NonNullable<FLEET_PAGE_QUERY_RESULT>;
type GeneratedFleetVehicle = GeneratedFleetPage["vehicles"][number];
type GeneratedImage = GeneratedFleetVehicle["exteriorImage"];
type GeneratedImageAsset = NonNullable<GeneratedImage["asset"]>;

/**
 * TypeGen is de bron voor de CMS-vorm. De runtimevalidator maakt asset/url
 * strenger dan Content Lake kan afleiden, zodat Next Image nooit een lege bron
 * ontvangt.
 */
export type CmsImage = Omit<GeneratedImage, "asset"> & {
  asset: Omit<GeneratedImageAsset, "url"> & { url: string };
};

export type CmsLocale = GeneratedServicesPage["language"];
export type CmsAction = GeneratedServicesPage["services"][number]["action"];
export type CmsSectionIntro = GeneratedServicesPage["intro"];
export type CmsService = GeneratedServicesPage["services"][number];
export type CmsAssurance = GeneratedServicesPage["assurances"][number];
export type CmsBusinessBenefit = GeneratedServicesPage["business"]["benefits"][number];
export type CmsBusinessSection = GeneratedServicesPage["business"];

export type CmsSeo = Omit<GeneratedServicesPage["seo"], "shareImage"> & {
  shareImage?: CmsImage | null;
};

export type CmsServicesPage = Omit<GeneratedServicesPage, "seo"> & {
  seo: CmsSeo;
};

export type CmsFleetVehicle = Omit<
  GeneratedFleetVehicle,
  "exteriorImage" | "interiorImage"
> & {
  exteriorImage: CmsImage;
  interiorImage: CmsImage;
};

export type CmsFleetPage = Omit<GeneratedFleetPage, "vehicles" | "seo"> & {
  vehicles: CmsFleetVehicle[];
  seo: CmsSeo;
};
