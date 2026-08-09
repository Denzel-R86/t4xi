import { CaseIcon } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

export const serviceCardType = defineType({
  name: "serviceCard",
  title: "Dienst",
  type: "object",
  icon: CaseIcon,
  fields: [
    defineField({
      name: "serviceType",
      title: "Dienstcategorie",
      type: "string",
      description:
        "Bepaalt het passende vaste pictogram; de visuele stijl blijft centraal beheerd.",
      options: {
        list: [
          { title: "Luchthavenvervoer", value: "airport" },
          { title: "Zakelijk vervoer", value: "business" },
          { title: "Privérit", value: "private" },
          { title: "Evenementenvervoer", value: "event" },
        ],
        layout: "dropdown",
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "title",
      title: "Naam van de dienst",
      type: "string",
      validation: (rule) => rule.required().min(4).max(44),
    }),
    defineField({
      name: "summary",
      title: "Kernomschrijving",
      type: "text",
      rows: 3,
      validation: (rule) => rule.required().min(35).max(180),
    }),
    defineField({
      name: "benefits",
      title: "Drie concrete voordelen",
      type: "array",
      of: [
        defineArrayMember({
          type: "string",
          validation: (rule) => rule.required().min(2).max(48),
        }),
      ],
      validation: (rule) =>
        rule.required().length(3).unique().error("Vul precies drie unieke voordelen in."),
    }),
    defineField({
      name: "action",
      title: "Vervolgactie",
      type: "actionLink",
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "summary" },
  },
});
