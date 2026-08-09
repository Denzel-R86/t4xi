import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo-locale";

export default function robots(): MetadataRoute.Robots {
  return {
    // De interne routes zijn met de proxy afgesloten (404 respectievelijk Basic
    // Auth). Ze staan hier óók, zodat crawlers ze niet blijven proberen en er geen
    // resten in de index achterblijven.
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/dashboard/brain", "/klant", "/studio"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
