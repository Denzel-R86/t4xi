import type { Metadata, Viewport } from "next";
import StudioClient from "./StudioClient";

export const dynamic = "force-static";

// Deze waarden zijn gelijk aan de Studio-hoofdexport, maar blijven hier lokaal
// zodat de React 19 Dashboard-bridge niet in deze Next 14-app wordt geladen.
export const metadata = {
  referrer: "same-origin",
  robots: "noindex",
} satisfies Metadata;

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
} satisfies Viewport;

export default function StudioPage() {
  return <StudioClient />;
}
