import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId, studioUrl } from "@/sanity/env";

export const sanityClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  perspective: "published",
  stega: { studioUrl },
  requestTagPrefix: "t4xi-web",
  // Een externe CMS-storing mag een koude publieke pagina niet lang blokkeren;
  // de loaders schakelen na deze begrensde poging over op de codefallback.
  timeout: 3_000,
  maxRetries: 0,
});
