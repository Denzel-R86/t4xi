export function uniqueStringField(
  value: unknown,
  fieldName: string,
  message: string,
) {
  if (!Array.isArray(value)) return true;

  const values = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = (item as Record<string, unknown>)[fieldName];
    return typeof candidate === "string" && candidate.length > 0
      ? [candidate.toLocaleLowerCase("nl-NL")]
      : [];
  });

  return new Set(values).size === values.length || message;
}
