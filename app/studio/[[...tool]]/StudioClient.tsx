"use client";

import { NextStudio } from "next-sanity/studio/client-component";
import config from "@/sanity.config";

/**
 * Sanity en de Studio-config blijven volledig achter een client boundary.
 * Zo probeert Next 14 de browser-only Studio niet als Server Component uit te
 * voeren en hoeft een config met callbacks niet via React Flight te serialiseren.
 */
export default function StudioClient() {
  return <NextStudio config={config} />;
}
