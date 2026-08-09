import { CheckmarkCircleIcon } from "@sanity/icons/CheckmarkCircle";
import { defineField, defineType } from "sanity";

export const businessBenefitType = defineType({
  name: "businessBenefit",
  title: "Zakelijk voordeel",
  type: "object",
  icon: CheckmarkCircleIcon,
  fields: [
    defineField({
      name: "title",
      title: "Voordeel",
      type: "string",
      validation: (rule) => rule.required().min(4).max(48),
    }),
    defineField({
      name: "explanation",
      title: "Toelichting",
      type: "string",
      validation: (rule) => rule.required().min(12).max(110),
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "explanation" },
  },
});
