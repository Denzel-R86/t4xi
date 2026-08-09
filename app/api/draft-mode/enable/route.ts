import { defineEnableDraftMode } from "next-sanity/draft-mode";
import { sanityClient } from "@/sanity/lib/client";

const token = process.env.SANITY_API_READ_TOKEN?.trim();

const unavailable = () =>
  new Response("Conceptweergave is nog niet geconfigureerd.", { status: 503 });

export const GET = token
  ? defineEnableDraftMode({ client: sanityClient.withConfig({ token }) }).GET
  : unavailable;
