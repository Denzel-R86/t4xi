import { CaseIcon, TransferIcon } from "@sanity/icons";
import type { ComponentType } from "react";
import type {
  StructureBuilder,
  StructureResolver,
} from "sanity/structure";
import {
  localizedSingletonId,
  SUPPORTED_LANGUAGES,
  type LocalizedSingletonSchemaType,
} from "./schemaTypes/constants";

function localizedSingleton(
  S: StructureBuilder,
  schemaType: LocalizedSingletonSchemaType,
  title: string,
  icon: ComponentType,
) {
  return S.listItem()
    .id(schemaType)
    .title(title)
    .icon(icon)
    .child(
      S.list()
        .id(`${schemaType}-languages`)
        .title(`${title} per taal`)
        .items(
          SUPPORTED_LANGUAGES.map((language) => {
            const documentId = localizedSingletonId(schemaType, language.id);
            return S.listItem()
              .id(documentId)
              .title(language.title)
              .icon(icon)
              .child(
                S.document()
                  .id(documentId)
                  .schemaType(schemaType)
                  .documentId(documentId)
                  .initialValueTemplate(documentId)
                  .title(`${title} — ${language.title}`),
              );
          }),
        ),
    );
}

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Websitebeheer")
    .items([
      localizedSingleton(S, "servicesPage", "Dienstenpagina", CaseIcon),
      S.divider(),
      localizedSingleton(S, "fleetPage", "Vlootpagina", TransferIcon),
    ]);
