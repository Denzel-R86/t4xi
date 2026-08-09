import { defineField } from "sanity";
import {
  localizedSingletonId,
  SUPPORTED_LANGUAGES,
  type LocalizedSingletonSchemaType,
} from "../constants";

export function localizedLanguageField(
  schemaType: LocalizedSingletonSchemaType,
) {
  return defineField({
    name: "language",
    title: "Taal",
    type: "string",
    readOnly: true,
    hidden: true,
    options: {
      list: SUPPORTED_LANGUAGES.map((language) => ({
        title: language.title,
        value: language.id,
      })),
    },
    validation: (rule) =>
      rule.required().custom((language, context) => {
        if (language !== "nl" && language !== "en") {
          return "Gebruik uitsluitend de taalcode nl of en.";
        }

        const documentId = context.document?._id?.replace(/^drafts\./, "");
        if (!documentId) return true;

        const expectedId = localizedSingletonId(schemaType, language);
        return (
          documentId === expectedId ||
          `Open deze pagina via Websitebeheer. Voor ${language.toUpperCase()} hoort document-ID “${expectedId}” bij dit document.`
        );
      }),
  });
}
