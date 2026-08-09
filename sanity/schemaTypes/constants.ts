export const SUPPORTED_LANGUAGES = [
  { id: "nl", title: "Nederlands" },
  { id: "en", title: "Engels" },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["id"];

export const LOCALIZED_SINGLETON_SCHEMA_TYPES = [
  "servicesPage",
  "fleetPage",
] as const;

export type LocalizedSingletonSchemaType =
  (typeof LOCALIZED_SINGLETON_SCHEMA_TYPES)[number];

export function localizedSingletonId(
  schemaType: LocalizedSingletonSchemaType,
  language: SupportedLanguage,
) {
  return `${schemaType}-${language}`;
}

export function languageTitle(language: string | undefined) {
  return (
    SUPPORTED_LANGUAGES.find((candidate) => candidate.id === language)?.title ??
    "Taal ontbreekt"
  );
}
