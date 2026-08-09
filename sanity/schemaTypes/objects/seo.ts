import { EarthGlobeIcon } from "@sanity/icons/EarthGlobe";
import { defineField, defineType } from "sanity";

export const seoType = defineType({
  name: "seo",
  title: "Zoekmachines en delen",
  type: "object",
  icon: EarthGlobeIcon,
  fields: [
    defineField({
      name: "metaTitle",
      title: "SEO-titel",
      type: "string",
      description:
        "Unieke paginatitel. De merknaam wordt alleen toegevoegd als de frontend dat expliciet doet.",
      validation: (rule) => [
        rule.required().max(60).error("Houd de SEO-titel op maximaal 60 tekens."),
        rule.min(30).warning("Een titel van minimaal 30 tekens benut de zoekresultaten beter."),
      ],
    }),
    defineField({
      name: "metaDescription",
      title: "Meta-omschrijving",
      type: "text",
      rows: 3,
      validation: (rule) => [
        rule
          .required()
          .max(160)
          .error("Houd de meta-omschrijving op maximaal 160 tekens."),
        rule
          .min(110)
          .warning("Een omschrijving vanaf circa 110 tekens geeft meer relevante context."),
      ],
    }),
    defineField({
      name: "shareImage",
      title: "Deelbeeld",
      type: "editorialImage",
      description:
        "Optioneel beeld voor sociale previews. Gebruik bij voorkeur 1200 × 630 pixels.",
    }),
  ],
});
