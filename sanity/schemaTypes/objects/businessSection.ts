import { CaseIcon } from "@sanity/icons/Case";
import { defineArrayMember, defineField, defineType } from "sanity";

export const businessSectionType = defineType({
  name: "businessSection",
  title: "Zakelijk vervoer",
  type: "object",
  icon: CaseIcon,
  fields: [
    defineField({
      name: "intro",
      title: "Introductie",
      type: "sectionIntro",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "benefits",
      title: "Zakelijke voordelen",
      type: "array",
      of: [defineArrayMember({ type: "businessBenefit" })],
      validation: (rule) =>
        rule.required().length(4).error("Vul precies vier zakelijke voordelen in."),
    }),
    defineField({
      name: "accountTitle",
      title: "Titel van het accountblok",
      type: "string",
      validation: (rule) => rule.required().min(4).max(48),
    }),
    defineField({
      name: "accountFeatures",
      title: "Eigenschappen van een zakelijk account",
      type: "array",
      of: [
        defineArrayMember({
          type: "string",
          validation: (rule) => rule.required().min(3).max(48),
        }),
      ],
      validation: (rule) =>
        rule
          .required()
          .length(6)
          .unique()
          .error("Vul precies zes unieke accounteigenschappen in."),
    }),
    defineField({
      name: "primaryAction",
      title: "Primaire contactactie",
      type: "actionLink",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "accountAction",
      title: "Actie in het accountblok",
      type: "actionLink",
      validation: (rule) => rule.required(),
    }),
  ],
});
