import type { Metadata } from "next";
import ServicesSection from "@/components/sections/ServicesSection";
import WhySection from "@/components/sections/WhySection";
import ZakelijkSection from "@/components/sections/ZakelijkSection";
import ProductsTeaser from "@/components/sections/ProductsTeaser";

export const metadata: Metadata = {
  title: "Diensten",
  description:
    "Schiphol transfers, zakelijk vervoer, privéritten en evenementen — premium elektrisch taxivervoer voor elke situatie.",
  alternates: { canonical: "/diensten" },
};

export default function DienstenPage() {
  return (
    <>
      <ServicesSection />
      <WhySection />
      <ZakelijkSection />
      <ProductsTeaser />
    </>
  );
}
