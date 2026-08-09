import { ComposeSparklesIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const sectionIntroType = defineType({
  name: "sectionIntro",
  title: "Introductie",
  type: "object",
  icon: ComposeSparklesIcon,
  fields: [
    defineField({
      name: "eyebrow",
      title: "Kleine bovenregel",
      type: "string",
      validation: (rule) => rule.required().min(2).max(48),
    }),
    defineField({
      name: "headline",
      title: "Hoofdkop",
      type: "string",
      description: "De eerste, feitelijke helft van de kop.",
      validation: (rule) => rule.required().min(6).max(64),
    }),
    defineField({
      name: "headlineConclusion",
      title: "Afronding van de hoofdkop",
      type: "string",
      description:
        "De betekenisvolle afronding van de kop; de website geeft deze een eigen redactioneel accent.",
      validation: (rule) => rule.required().min(4).max(64),
    }),
    defineField({
      name: "introduction",
      title: "Inleidende tekst",
      type: "text",
      rows: 4,
      validation: (rule) => rule.required().min(45).max(260),
    }),
  ],
  preview: {
    select: { title: "headline", subtitle: "headlineConclusion" },
  },
});
