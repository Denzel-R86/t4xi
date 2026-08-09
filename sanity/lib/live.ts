import { defineLive } from "next-sanity";
import { sanityClient } from "@/sanity/lib/client";

const readToken = process.env.SANITY_API_READ_TOKEN?.trim() || false;

/**
 * Next.js 14-compatibele Live Content API. Het Viewer-token blijft uitsluitend
 * server-side; er wordt bewust geen token naar de browser doorgestuurd.
 */
export const { sanityFetch, SanityLive } = defineLive({
  client: sanityClient,
  serverToken: readToken,
  browserToken: false,
  fetchOptions: { revalidate: 300 },
  stega: true,
});
