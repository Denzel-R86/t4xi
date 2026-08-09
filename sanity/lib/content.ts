import { sanityFetch } from "@/sanity/lib/live";
import { FLEET_PAGE_QUERY, SERVICES_PAGE_QUERY } from "@/sanity/queries/content";
import { isSafeCmsInternalHref } from "@/lib/cms/safe-content";
import type {
  CmsAction,
  CmsBusinessSection,
  CmsFleetPage,
  CmsImage,
  CmsSectionIntro,
  CmsSeo,
  CmsServicesPage,
} from "@/sanity/types";
import { stegaClean } from "next-sanity";

type SupportedLocale = "nl" | "en";

const SERVICE_TYPES = ["airport", "business", "private", "event"] as const;
const ASSURANCE_TYPES = ["flight", "fleet", "drivers", "pricing"] as const;

function localeOrDefault(locale: string): SupportedLocale {
  return locale === "en" ? "en" : "nl";
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && stegaClean(value).trim().length > 0;
}

function cleanComparable(value: unknown): string {
  return typeof value === "string"
    ? stegaClean(value).trim().toLocaleLowerCase("nl-NL")
    : "";
}

function validStringArray(
  value: unknown,
  minimum = 1,
  unique = false,
): value is string[] {
  if (!Array.isArray(value) || value.length < minimum || !value.every(isNonEmpty)) {
    return false;
  }

  if (unique) {
    const cleaned = value.map(cleanComparable);
    return new Set(cleaned).size === cleaned.length;
  }

  return true;
}

function uniqueObjectField(items: unknown[], fieldName: string): boolean {
  const values = items.map((item) =>
    item && typeof item === "object"
      ? cleanComparable((item as Record<string, unknown>)[fieldName])
      : "",
  );
  return (
    values.every(Boolean) && new Set(values).size === values.length
  );
}

function hasExactFieldValues(
  items: unknown[],
  fieldName: string,
  allowedValues: readonly string[],
): boolean {
  if (items.length !== allowedValues.length) return false;
  const values = items.map((item) =>
    item && typeof item === "object"
      ? cleanComparable((item as Record<string, unknown>)[fieldName])
      : "",
  );
  return (
    values.every((value) => allowedValues.includes(value)) &&
    new Set(values).size === allowedValues.length
  );
}

function validAction(value: unknown): value is CmsAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<CmsAction>;
  return isNonEmpty(action.label) && isSafeCmsInternalHref(action.href);
}

function validIntro(value: unknown): value is CmsSectionIntro {
  if (!value || typeof value !== "object") return false;
  const intro = value as Partial<CmsSectionIntro>;
  return Boolean(
    isNonEmpty(intro.eyebrow) &&
      isNonEmpty(intro.headline) &&
      isNonEmpty(intro.headlineConclusion) &&
      isNonEmpty(intro.introduction),
  );
}

function validImage(value: unknown): value is CmsImage {
  if (!value || typeof value !== "object") return false;
  const image = value as CmsImage;
  return Boolean(isNonEmpty(image.alt) && isNonEmpty(image.asset?._id) && isNonEmpty(image.asset?.url));
}

function validSeo(value: unknown): value is CmsSeo {
  if (!value || typeof value !== "object") return false;
  const seo = value as Partial<CmsSeo>;
  return Boolean(
    isNonEmpty(seo.metaTitle) &&
      isNonEmpty(seo.metaDescription) &&
      (!seo.shareImage || validImage(seo.shareImage)),
  );
}

function validBusiness(value: unknown): value is CmsBusinessSection {
  if (!value || typeof value !== "object") return false;
  const business = value as Partial<CmsBusinessSection>;
  return Boolean(
    validIntro(business.intro) &&
      Array.isArray(business.benefits) &&
      business.benefits.length === 4 &&
      uniqueObjectField(business.benefits, "_key") &&
      business.benefits.every(
        (benefit) =>
          isNonEmpty(benefit?._key) &&
          isNonEmpty(benefit?.title) &&
          isNonEmpty(benefit?.explanation),
      ) &&
      isNonEmpty(business.accountTitle) &&
      validStringArray(business.accountFeatures, 6, true) &&
      business.accountFeatures.length === 6 &&
      validAction(business.primaryAction) &&
      validAction(business.accountAction),
  );
}

function validServicesPage(
  value: unknown,
  locale: SupportedLocale,
): value is CmsServicesPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<CmsServicesPage>;
  return Boolean(
    stegaClean(page._id) === `servicesPage-${locale}` &&
      stegaClean(page.language) === locale &&
      validIntro(page.intro) &&
      Array.isArray(page.services) &&
      page.services.length === 4 &&
      uniqueObjectField(page.services, "_key") &&
      hasExactFieldValues(page.services, "serviceType", SERVICE_TYPES) &&
      page.services.every(
        (service) =>
          isNonEmpty(service?._key) &&
          isNonEmpty(service?.title) &&
          isNonEmpty(service?.summary) &&
          validStringArray(service?.benefits, 3, true) &&
          service.benefits.length === 3 &&
          validAction(service?.action),
      ) &&
      validIntro(page.assurancesIntro) &&
      Array.isArray(page.assurances) &&
      page.assurances.length === 4 &&
      uniqueObjectField(page.assurances, "_key") &&
      hasExactFieldValues(page.assurances, "assuranceType", ASSURANCE_TYPES) &&
      page.assurances.every(
        (assurance) =>
          isNonEmpty(assurance?._key) &&
          isNonEmpty(assurance?.title) &&
          isNonEmpty(assurance?.explanation),
      ) &&
      validBusiness(page.business) &&
      validSeo(page.seo),
  );
}

function validFleetPage(
  value: unknown,
  locale: SupportedLocale,
): value is CmsFleetPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<CmsFleetPage>;
  return Boolean(
    stegaClean(page._id) === `fleetPage-${locale}` &&
      stegaClean(page.language) === locale &&
      validIntro(page.intro) &&
      Array.isArray(page.vehicles) &&
      page.vehicles.length >= 2 &&
      page.vehicles.length <= 4 &&
      uniqueObjectField(page.vehicles, "_key") &&
      uniqueObjectField(page.vehicles, "modelName") &&
      page.vehicles.every(
        (vehicle) =>
          isNonEmpty(vehicle?._key) &&
          isNonEmpty(vehicle?.modelName) &&
          isNonEmpty(vehicle?.powertrain) &&
          isNonEmpty(vehicle?.description) &&
          validStringArray(vehicle?.attributes, 2, true) &&
          vehicle.attributes.length <= 5 &&
          validImage(vehicle?.exteriorImage) &&
          validImage(vehicle?.interiorImage) &&
          (stegaClean(vehicle?.interiorImageType) === "modelSpecific" ||
            (stegaClean(vehicle?.interiorImageType) === "mood" &&
              isNonEmpty(vehicle?.moodImageDisclosure))),
      ) &&
      isNonEmpty(page.availabilityNote) &&
      isNonEmpty(page.servicePromise) &&
      validAction(page.action) &&
      validSeo(page.seo),
  );
}

export async function loadCmsServicesPage(
  locale: string,
  options: { stega?: boolean } = {},
): Promise<CmsServicesPage | null> {
  const selectedLocale = localeOrDefault(locale);
  try {
    const { data } = await sanityFetch({
      query: SERVICES_PAGE_QUERY,
      params: { locale: selectedLocale },
      tags: ["cms-services", `cms-services-${selectedLocale}`],
      requestTag: "services-page",
      stega: options.stega,
    });
    return validServicesPage(data, selectedLocale) ? data : null;
  } catch {
    console.warn("[cms] dienstencontent niet beschikbaar; codefallback actief");
    return null;
  }
}

export async function loadCmsFleetPage(
  locale: string,
  options: { stega?: boolean } = {},
): Promise<CmsFleetPage | null> {
  const selectedLocale = localeOrDefault(locale);
  try {
    const { data } = await sanityFetch({
      query: FLEET_PAGE_QUERY,
      params: { locale: selectedLocale },
      tags: ["cms-fleet", `cms-fleet-${selectedLocale}`],
      requestTag: "fleet-page",
      stega: options.stega,
    });
    return validFleetPage(data, selectedLocale) ? data : null;
  } catch {
    console.warn("[cms] vlootcontent niet beschikbaar; codefallback actief");
    return null;
  }
}
