import createNextIntlPlugin from "next-intl/plugin";

// Dev-bundels van Next.js (webpack/react-refresh) vereisen eval;
// in productie blijft script-src strikt.
const isDev = process.env.NODE_ENV === "development";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
              // Stripe.js (Payment Element) wordt geladen van js.stripe.com.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              "img-src 'self' data: https:",
              // Stripe-API voor de Payment Element; overige = bestaande bronnen.
              "connect-src 'self' https://*.supabase.co https://api.pdok.nl https://places.googleapis.com https://api.stripe.com",
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
