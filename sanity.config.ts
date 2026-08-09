import { defineConfig, type Template } from "sanity";
import { presentationTool } from "sanity/presentation";
import { structureTool } from "sanity/structure";
import { dataset, projectId } from "./sanity/env";
import { resolve } from "./sanity/presentation/resolve";
import {
  LOCALIZED_SINGLETON_SCHEMA_TYPES,
  localizedSingletonId,
  SUPPORTED_LANGUAGES,
} from "./sanity/schemaTypes/constants";
import { schemaTypes } from "./sanity/schemaTypes";
import { structure } from "./sanity/structure";

const localizedSingletonTemplates: Template[] =
  LOCALIZED_SINGLETON_SCHEMA_TYPES.flatMap((schemaType) =>
    SUPPORTED_LANGUAGES.map((language) => ({
      id: localizedSingletonId(schemaType, language.id),
      title: `${schemaType === "servicesPage" ? "Dienstenpagina" : "Vlootpagina"} — ${language.title}`,
      schemaType,
      value: { language: language.id },
    })),
  );

export default defineConfig({
  name: "default",
  title: "T4XI Websitebeheer",
  basePath: "/studio",
  projectId,
  dataset,
  plugins: [
    structureTool({ structure }),
    presentationTool({
      resolve,
      previewUrl: {
        previewMode: {
          enable: "/api/draft-mode/enable",
        },
      },
    }),
  ],
  schema: {
    types: schemaTypes,
  },
  templates: (previousTemplates: Template[]) => [
    ...previousTemplates.filter(
      (template) =>
        !LOCALIZED_SINGLETON_SCHEMA_TYPES.includes(
          template.schemaType as (typeof LOCALIZED_SINGLETON_SCHEMA_TYPES)[number],
        ),
    ),
    ...localizedSingletonTemplates,
  ],
  document: {
    actions: (previousActions, context) => {
      if (
        !LOCALIZED_SINGLETON_SCHEMA_TYPES.includes(
          context.schemaType as (typeof LOCALIZED_SINGLETON_SCHEMA_TYPES)[number],
        )
      ) {
        return previousActions;
      }

      return previousActions.filter(
        (action) => action.action !== "delete" && action.action !== "duplicate",
      );
    },
    newDocumentOptions: (previousOptions) =>
      previousOptions.filter(
        (option) =>
          !LOCALIZED_SINGLETON_SCHEMA_TYPES.some(
            (schemaType) =>
              option.templateId === schemaType ||
              option.templateId.startsWith(`${schemaType}-`),
          ),
      ),
  },
});
