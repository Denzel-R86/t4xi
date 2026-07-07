import type { Metadata } from "next";
import { loadBrainDashboard } from "./data";
import BrainDashboard from "./BrainDashboard";

export const metadata: Metadata = {
  title: "Pricing Brain — intern",
  description: "Interne, read-only demo van de T4XI Pricing Brain (admin).",
  robots: { index: false, follow: false },
};

// Altijd server-side verse berekening; niet pre-renderen/cachen.
export const dynamic = "force-dynamic";

export default async function BrainDashboardPage() {
  const data = await loadBrainDashboard();
  return <BrainDashboard data={data} />;
}
