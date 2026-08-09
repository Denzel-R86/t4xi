import { ImageIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const editorialImageType = defineType({
  name: "editorialImage",
  title: "Redactioneel beeld",
  type: "image",
  icon: ImageIcon,
  options: {
    hotspot: true,
  },
  fields: [
    defineField({
      name: "alt",
      title: "Alternatieve tekst",
      type: "string",
      description:
        "Beschrijf concreet wat zichtbaar is. Vermijd ‘afbeelding van’ en marketingtaal.",
      validation: (rule) => rule.required().min(8).max(160),
    }),
    defineField({
      name: "caption",
      title: "Bijschrift",
      type: "string",
      description: "Optioneel; alleen gebruiken als het beeld uitleg nodig heeft.",
      validation: (rule) => rule.max(120),
    }),
    defineField({
      name: "credit",
      title: "Fotocredit",
      type: "string",
      description: "Optioneel; naam van fotograaf of rechthebbende.",
      validation: (rule) => rule.max(80),
    }),
  ],
  // Het objecttype zelf mag optioneel worden gebruikt (bijvoorbeeld als
  // shareImage). Zodra een beeld is ingevuld, is een echte asset verplicht.
  // Velden die altijd een beeld nodig hebben voegen zelf `rule.required()` toe.
  validation: (rule) => rule.assetRequired(),
});
