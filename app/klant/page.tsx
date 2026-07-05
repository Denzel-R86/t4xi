import type { Metadata } from "next";
import KlantPortal from "@/components/klant/KlantPortal";

export const metadata: Metadata = {
  title: "Mijn account",
  description:
    "Log in op uw persoonlijke T4XI ritportaal: boek ritten, bekijk uw rithistorie, beheer adressen en download facturen.",
  alternates: { canonical: "/klant" },
  robots: { index: false, follow: true },
};

export default function KlantPage() {
  return <KlantPortal />;
}
