import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    // De interne routes zijn met middleware afgesloten (404 respectievelijk Basic
    // Auth). Ze staan hier óók, zodat crawlers ze niet blijven proberen en er geen
    // resten in de index achterblijven.
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/dashboard/brain", "/klant"],
    },
    sitemap: "https://t4xi.nl/sitemap.xml",
  };
}
