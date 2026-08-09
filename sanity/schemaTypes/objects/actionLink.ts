import { LinkIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const actionLinkType = defineType({
  name: "actionLink",
  title: "Actieknop",
  type: "object",
  icon: LinkIcon,
  fields: [
    defineField({
      name: "label",
      title: "Knoptekst",
      type: "string",
      description: "Kort en handelingsgericht, bijvoorbeeld ‘Boek een rit’.",
      validation: (rule) => rule.required().min(3).max(32),
    }),
    defineField({
      name: "href",
      title: "Interne bestemming",
      type: "string",
      description: "Gebruik een route binnen T4XI, bijvoorbeeld /boeken of /contact.",
      validation: (rule) =>
        rule.required().custom((value) => {
          if (!value) return true;
          return (
            (value.startsWith("/") &&
              !value.startsWith("//") &&
              !/[\\\s]/.test(value)) ||
            "Gebruik een veilige interne route die met één / begint."
          );
        }),
    }),
    defineField({
      name: "accessibleLabel",
      title: "Toegankelijke toelichting",
      type: "string",
      description:
        "Alleen invullen als de knoptekst zonder context niet duidelijk genoeg is.",
      validation: (rule) => rule.max(80),
    }),
  ],
  preview: {
    select: { title: "label", subtitle: "href" },
  },
});
