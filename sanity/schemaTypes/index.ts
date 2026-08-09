import { fleetPageType } from "./documents/fleetPage";
import { servicesPageType } from "./documents/servicesPage";
import { actionLinkType } from "./objects/actionLink";
import { assuranceType } from "./objects/assurance";
import { businessBenefitType } from "./objects/businessBenefit";
import { businessSectionType } from "./objects/businessSection";
import { editorialImageType } from "./objects/editorialImage";
import { sectionIntroType } from "./objects/sectionIntro";
import { seoType } from "./objects/seo";
import { serviceCardType } from "./objects/serviceCard";
import { vehicleType } from "./objects/vehicle";

export const schemaTypes = [
  actionLinkType,
  editorialImageType,
  sectionIntroType,
  seoType,
  serviceCardType,
  assuranceType,
  businessBenefitType,
  businessSectionType,
  vehicleType,
  servicesPageType,
  fleetPageType,
];

export {
  actionLinkType,
  assuranceType,
  businessBenefitType,
  businessSectionType,
  editorialImageType,
  fleetPageType,
  sectionIntroType,
  seoType,
  serviceCardType,
  servicesPageType,
  vehicleType,
};
