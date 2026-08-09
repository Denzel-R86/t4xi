import { TransferIcon } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";
import { languageTitle } from "../constants";
import { localizedLanguageField } from "../shared/localizedLanguageField";
import { uniqueStringField } from "../shared/validators";

export const fleetPageType = defineType({
  name: "fleetPage",
  title: "Vlootpagina",
  type: "document",
  icon: TransferIcon,
  groups: [
    { name: "intro", title: "Introductie", default: true },
    { name: "vehicles", title: "Voertuigen" },
    { name: "promise", title: "Servicebelofte" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    localizedLanguageField("fleetPage"),
    defineField({
      name: "intro",
      title: "Pagina-introductie",
      type: "sectionIntro",
      group: "intro",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "vehicles",
      title: "Voertuigmodellen",
      type: "array",
      group: "vehicles",
      description:
        "Twee tot vier modellen houden de vlootpresentatie overzichtelijk en redactioneel sterk.",
      of: [defineArrayMember({ type: "vehicle" })],
      validation: (rule) => [
        rule
          .required()
          .min(2)
          .max(4)
          .error("Toon minimaal twee en maximaal vier voertuigmodellen."),
        rule.custom((value) =>
          uniqueStringField(
            value,
            "modelName",
            "Ieder voertuigmodel mag maar één keer voorkomen.",
          ),
        ),
      ],
    }),
    defineField({
      name: "availabilityNote",
      title: "Toelichting beschikbaarheid",
      type: "text",
      rows: 3,
      group: "promise",
      description:
        "Leg transparant uit dat de planning bepaalt welk model wordt ingezet.",
      validation: (rule) => rule.required().min(35).max(180),
    }),
    defineField({
      name: "servicePromise",
      title: "Gelijke servicebelofte",
      type: "string",
      group: "promise",
      description:
        "De standaard die voor ieder voertuig en iedere rit hetzelfde blijft.",
      validation: (rule) => rule.required().min(20).max(120),
    }),
    defineField({
      name: "action",
      title: "Boekingsactie",
      type: "actionLink",
      group: "promise",
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
    select: { language: "language", media: "vehicles.0.exteriorImage" },
    prepare({ language, media }) {
      return {
        title: "Vlootpagina",
        subtitle: languageTitle(language),
        media,
      };
    },
  },
});
