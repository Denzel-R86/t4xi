import createNextIntlPlugin from "next-intl/plugin";

// Dev-bundels van Next.js (webpack/react-refresh) vereisen eval;
// in productie blijft script-src strikt.
const isDev = process.env.NODE_ENV === "development";

// De browser mag uitsluitend met het exact geconfigureerde project/dataset
// communiceren. Strikte syntaxvalidatie voorkomt dat een environment-waarde een
// extra CSP-origin of pad kan injecteren.
const sanityProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID?.trim() || "95pzjxjq";
const sanityDataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.trim() || "production";
if (!/^[a-z0-9]+$/.test(sanityProjectId) || !/^[a-z0-9_-]+$/.test(sanityDataset)) {
  throw new Error("Ongeldige publieke Sanity project- of datasetconfiguratie.");
}
const sanityApiOrigin = `https://${sanityProjectId}.api.sanity.io`;
const sanityApiCdnOrigin = `https://${sanityProjectId}.apicdn.sanity.io`;
const sanityWebSocketOrigin = `wss://${sanityProjectId}.api.sanity.io`;
const sanityImageSource = `https://cdn.sanity.io/images/${sanityProjectId}/${sanityDataset}/`;
// De officiële NextStudio-bridge wordt als ES-module vanaf deze vaste Sanity-
// origin geladen. Zonder deze exacte bron blokkeert de CSP de beheeromgeving.
const sanityCoreOrigin = "https://core.sanity-cdn.com";

// Sta alleen het daadwerkelijk geconfigureerde Supabase-project toe. Een wildcard
// zou iedere *.supabase.co-origin toegang geven vanuit de browsercontext.
let supabaseConnectOrigin = "";
try {
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configuredSupabaseUrl) {
    const parsed = new URL(configuredSupabaseUrl);
    if (parsed.protocol === "https:") supabaseConnectOrigin = ` ${parsed.origin}`;
  }
} catch {
  // De environment-guard meldt een ongeldige productieconfiguratie afzonderlijk.
}

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        port: "",
        pathname: `/images/${sanityProjectId}/${sanityDataset}/**`,
      },
    ],
  },
  // Security headers conform T4XI CLAUDE.md security-eisen
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Presentation toont de eigen website in een same-origin iframe. Andere
          // origins blijven door XFO én CSP uitgesloten.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              // Stripe.js (Payment Element) wordt geladen van js.stripe.com.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com ${sanityCoreOrigin}`,
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              `img-src 'self' data: blob: ${sanityImageSource}`,
              "worker-src 'self' blob:",
              // Stripe-API voor de Payment Element; overige = bestaande bronnen.
              `connect-src 'self'${supabaseConnectOrigin} https://api.pdok.nl https://places.googleapis.com https://api.stripe.com ${sanityApiOrigin} ${sanityApiCdnOrigin} ${sanityWebSocketOrigin}`,
              // Payment Element + 3D Secure draaien in Stripe-iframes.
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
