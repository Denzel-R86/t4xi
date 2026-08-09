import { TransferIcon } from "@sanity/icons/Transfer";
import { defineArrayMember, defineField, defineType } from "sanity";

export const vehicleType = defineType({
  name: "vehicle",
  title: "Voertuigmodel",
  type: "object",
  icon: TransferIcon,
  fields: [
    defineField({
      name: "modelName",
      title: "Merk en model",
      type: "string",
      validation: (rule) => rule.required().min(4).max(60),
    }),
    defineField({
      name: "powertrain",
      title: "Aandrijving",
      type: "string",
      description: "Bijvoorbeeld ‘Volledig elektrisch’ of ‘Plug-in hybride’.",
      validation: (rule) => rule.required().min(4).max(42),
    }),
    defineField({
      name: "description",
      title: "Redactionele omschrijving",
      type: "text",
      rows: 4,
      validation: (rule) => rule.required().min(45).max(220),
    }),
    defineField({
      name: "attributes",
      title: "Kenmerken",
      type: "array",
      description: "Alleen concrete, controleerbare eigenschappen van dit model.",
      of: [
        defineArrayMember({
          type: "string",
          validation: (rule) => rule.required().min(3).max(42),
        }),
      ],
      validation: (rule) => rule.required().min(2).max(5).unique(),
    }),
    defineField({
      name: "exteriorImage",
      title: "Exterieur",
      type: "editorialImage",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "interiorImage",
      title: "Interieur",
      type: "editorialImage",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "interiorImageType",
      title: "Herkomst interieurbeeld",
      type: "string",
      description:
        "Een sfeerbeeld moet op de website als zodanig herkenbaar blijven; kies alleen ‘Modelspecifiek’ wanneer het getoonde interieur exact bij dit model hoort.",
      options: {
        list: [
          { title: "Modelspecifiek interieur", value: "modelSpecific" },
          { title: "Representatief sfeerbeeld", value: "mood" },
        ],
        layout: "radio",
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "moodImageDisclosure",
      title: "Vermelding bij sfeerbeeld",
      type: "string",
      description:
        "Korte, transparante vermelding die bij het interieurbeeld wordt getoond.",
      hidden: ({ parent }) => parent?.interiorImageType !== "mood",
      validation: (rule) =>
        rule.custom((value, context) => {
          const imageType = (context.parent as { interiorImageType?: string } | undefined)
            ?.interiorImageType;
          if (imageType !== "mood") return true;
          return (
            (typeof value === "string" && value.trim().length >= 8 && value.length <= 80) ||
            "Vul bij een sfeerbeeld een transparante vermelding van 8–80 tekens in."
          );
        }),
    }),
  ],
  preview: {
    select: {
      title: "modelName",
      subtitle: "powertrain",
      media: "exteriorImage",
    },
  },
});
