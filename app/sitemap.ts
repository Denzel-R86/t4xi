import type { MetadataRoute } from "next";

const BASE = "https://t4xi.nl";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/diensten", "/tarieven", "/over-ons", "/boeken"].map<MetadataRoute.Sitemap[number]>((path) => ({
    url: `${BASE}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/boeken" ? 0.9 : 0.7,
  }));
}
