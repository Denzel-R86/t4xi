import { CaseIcon } from "@sanity/icons/Case";
import { defineArrayMember, defineField, defineType } from "sanity";
import { languageTitle } from "../constants";
import { localizedLanguageField } from "../shared/localizedLanguageField";
import { uniqueStringField } from "../shared/validators";

export const servicesPageType = defineType({
  name: "servicesPage",
  title: "Dienstenpagina",
  type: "document",
  icon: CaseIcon,
  groups: [
    { name: "intro", title: "Introductie", default: true },
    { name: "services", title: "Diensten" },
    { name: "assurances", title: "Kwaliteitsbeloften" },
    { name: "business", title: "Zakelijk" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    localizedLanguageField("servicesPage"),
    defineField({
      name: "intro",
      title: "Pagina-introductie",
      type: "sectionIntro",
      group: "intro",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "services",
      title: "Dienstenaanbod",
      type: "array",
      group: "services",
      description:
        "De vier vaste dienstcategorieën bewaken het premium ritme van de pagina. De volgorde is redactioneel aanpasbaar.",
      of: [defineArrayMember({ type: "serviceCard" })],
      validation: (rule) => [
        rule.required().length(4).error("Vul precies vier diensten in."),
        rule.custom((value) =>
          uniqueStringField(
            value,
            "serviceType",
            "Gebruik iedere dienstcategorie één keer.",
          ),
        ),
      ],
    }),
    defineField({
      name: "assurancesIntro",
      title: "Introductie kwaliteitsbeloften",
      type: "sectionIntro",
      group: "assurances",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "assurances",
      title: "Kwaliteitsbeloften",
      type: "array",
      group: "assurances",
      of: [defineArrayMember({ type: "assurance" })],
      validation: (rule) => [
        rule.required().length(4).error("Vul precies vier kwaliteitsbeloften in."),
        rule.custom((value) =>
          uniqueStringField(
            value,
            "assuranceType",
            "Gebruik ieder onderwerp één keer.",
          ),
        ),
      ],
    }),
    defineField({
      name: "business",
      title: "Sectie zakelijk vervoer",
      type: "businessSection",
      group: "business",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "seo",
      title: "Zoekmachines en delen",
      type: "seo",
      group: "seo",
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { language: "language" },
    prepare({ language }) {
      return {
        title: "Dienstenpagina",
        subtitle: languageTitle(language),
      };
    },
  },
});
