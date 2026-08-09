import { pageMetadata } from "@/lib/seo-locale";
import ServicesSection from "@/components/sections/ServicesSection";
import WhySection from "@/components/sections/WhySection";
import ZakelijkSection from "@/components/sections/ZakelijkSection";
import ProductsTeaser from "@/components/sections/ProductsTeaser";
import { setRequestLocale } from "next-intl/server";

export function generateMetadata({ params }: { params: { locale: string } }) {
  return pageMetadata(params.locale, "/diensten", "dienstenTitle", "dienstenDesc");
}

export default function DienstenPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <>
      <ServicesSection />
      <WhySection />
      <ZakelijkSection />
      <ProductsTeaser />
    </>
  );
}
