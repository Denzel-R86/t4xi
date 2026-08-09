import createNextIntlPlugin from "next-intl/plugin";

// Dev-bundels van Next.js (webpack/react-refresh) vereisen eval;
// in productie blijft script-src strikt.
const isDev = process.env.NODE_ENV === "development";

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
  // Activeert instrumentation.ts (boot-tijd environment-guard). In Next 14.2 nog
  // achter een experimental-flag; vanaf Next 15 standaard.
  experimental: { instrumentationHook: true },
  // Security headers conform T4XI CLAUDE.md security-eisen
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
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
              "frame-ancestors 'none'",
              // Stripe.js (Payment Element) wordt geladen van js.stripe.com.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              "img-src 'self' data: https:",
              // Stripe-API voor de Payment Element; overige = bestaande bronnen.
              `connect-src 'self'${supabaseConnectOrigin} https://api.pdok.nl https://places.googleapis.com https://api.stripe.com`,
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
