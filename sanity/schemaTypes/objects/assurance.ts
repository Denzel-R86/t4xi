import { CheckmarkCircleIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const assuranceType = defineType({
  name: "assurance",
  title: "Kwaliteitsbelofte",
  type: "object",
  icon: CheckmarkCircleIcon,
  fields: [
    defineField({
      name: "assuranceType",
      title: "Onderwerp",
      type: "string",
      description:
        "Bepaalt het inhoudelijk passende pictogram; kleur en vormgeving zijn niet vrij instelbaar.",
      options: {
        list: [
          { title: "Vlucht en punctualiteit", value: "flight" },
          { title: "Voertuigen en comfort", value: "fleet" },
          { title: "Chauffeurs en veiligheid", value: "drivers" },
          { title: "Tarieven en transparantie", value: "pricing" },
        ],
        layout: "dropdown",
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "title",
      title: "Belofte",
      type: "string",
      validation: (rule) => rule.required().min(5).max(52),
    }),
    defineField({
      name: "explanation",
      title: "Onderbouwing",
      type: "text",
      rows: 4,
      description:
        "Schrijf alleen wat T4XI aantoonbaar en operationeel kan waarmaken.",
      validation: (rule) => rule.required().min(45).max(220),
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "explanation" },
  },
});
