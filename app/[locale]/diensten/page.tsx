import { localeMetadata, pageMetadata } from "@/lib/seo-locale";
import ServicesSection from "@/components/sections/ServicesSection";
import WhySection from "@/components/sections/WhySection";
import ZakelijkSection from "@/components/sections/ZakelijkSection";
import ProductsTeaser from "@/components/sections/ProductsTeaser";
import CmsLivePreview from "@/components/cms/CmsLivePreview";
import { loadCmsServicesPage } from "@/sanity/lib/content";
import { urlForImage } from "@/sanity/lib/image";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: { locale: string } }) {
  const content = await loadCmsServicesPage(params.locale, { stega: false });
  if (!content) {
    return pageMetadata(params.locale, "/diensten", "dienstenTitle", "dienstenDesc");
  }

  const locale = hasLocale(routing.locales, params.locale)
    ? params.locale
    : routing.defaultLocale;
  const shareImage = content.seo.shareImage;
  const image = shareImage?.asset?.url
    ? {
        url: urlForImage(shareImage)
          .width(1200)
          .height(630)
          .fit("crop")
          .auto("format")
          .url(),
        width: 1200,
        height: 630,
        alt: shareImage.alt,
      }
    : undefined;

  return localeMetadata({
    locale,
    path: "/diensten",
    title: content.seo.metaTitle,
    description: content.seo.metaDescription,
    image,
  });
}

export default async function DienstenPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const cmsContent = await loadCmsServicesPage(params.locale);
  return (
    <>
      <ServicesSection content={cmsContent} />
      <WhySection content={cmsContent} />
      <ZakelijkSection content={cmsContent} />
      <ProductsTeaser />
      <CmsLivePreview />
    </>
  );
}
