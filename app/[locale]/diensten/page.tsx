import { pageMetadata } from "@/lib/seo-locale";
import ServicesSection from "@/components/sections/ServicesSection";
import WhySection from "@/components/sections/WhySection";
import ZakelijkSection from "@/components/sections/ZakelijkSection";
import ProductsTeaser from "@/components/sections/ProductsTeaser";

export function generateMetadata({ params }: { params: { locale: string } }) {
  return pageMetadata(params.locale, "/diensten", "dienstenTitle", "dienstenDesc");
}

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
