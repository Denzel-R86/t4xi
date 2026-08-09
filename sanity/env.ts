export const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID?.trim() || "95pzjxjq";

export const dataset =
  process.env.NEXT_PUBLIC_SANITY_DATASET?.trim() || "production";

export const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION?.trim() || "2026-08-09";

export const studioUrl =
  process.env.NEXT_PUBLIC_SANITY_STUDIO_URL?.trim() || "/studio";
