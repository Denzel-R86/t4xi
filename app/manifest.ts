import type { MetadataRoute } from "next";

/**
 * PWA-manifest. Iconen en kleuren komen uit de T4XI Brand Guide 2026:
 * Primary Navy #28313B, monogram-app-icon (Fase 3, Digital Assets).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "T4XI — Executive Mobility",
    short_name: "T4XI",
    description:
      "Premium Nederlands taxiplatform. 100% elektrisch, vaste tarieven, professionele chauffeurs.",
    start_url: "/",
    display: "standalone",
    background_color: "#28313B",
    theme_color: "#28313B",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
