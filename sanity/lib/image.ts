import createImageUrlBuilder from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { dataset, projectId } from "@/sanity/env";

const builder = createImageUrlBuilder({ projectId, dataset });

export function urlForImage(source: unknown) {
  return builder.image(source as SanityImageSource);
}
