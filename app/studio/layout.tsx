import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo-locale";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export default function StudioRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
