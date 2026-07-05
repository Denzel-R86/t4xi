import type { Config } from "tailwindcss";

/**
 * T4XI Design System v14 — "Stone Premium" licht
 * Bron: t4xi_v14 statisch design (index.html :root tokens).
 * Warm stone-canvas, witte cards met zachte diepe schaduwen,
 * donkere navy-accent (#28313B) voor CTA's en highlights.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fog: "#F5F3F1",         // bg-base
        overlay: "#EEEAE5",     // bg-overlay
        subtle: "#E6E2DC",      // bg-subtle
        field: "#F9F7F4",       // formuliervelden
        card: "#FFFFFF",        // cards / bg-raised
        ink: {
          DEFAULT: "#1F2730",   // primaire tekst + donkere footer
          soft: "#28313B",
        },
        accent: {
          DEFAULT: "#28313B",   // CTA / actieve states / prijzen
          hover: "#1F2730",
          light: "#3A4652",
        },
        stone: {
          text: "#5F666D",      // secundaire tekst
          DEFAULT: "#999694",   // platinum accent (logo-4, labels)
          subtle: "#CBC8C4",
        },
        line: {
          DEFAULT: "rgba(31,39,48,0.10)",
          strong: "rgba(31,39,48,0.18)",
        },
        secondary: "#5F666D",
        whatsapp: "#25d366",
      },
      fontFamily: {
        display: ["var(--font-outfit)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["clamp(2.75rem, 6vw, 4.5rem)", { lineHeight: "1.05", letterSpacing: "-0.055em" }],
        "display-lg": ["clamp(2rem, 4vw, 3rem)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display-md": ["clamp(1.5rem, 2.5vw, 2rem)", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        eyebrow: ["0.75rem", { lineHeight: "1", letterSpacing: "0.19em" }],
      },
      boxShadow: {
        card: "0 22px 60px rgba(31,39,48,0.08)",
        "card-lg": "0 28px 90px rgba(31,39,48,0.10)",
        "hero-card": "0 30px 90px rgba(31,39,48,0.14)",
        cta: "0 18px 34px rgba(31,39,48,0.18)",
        nav: "0 12px 34px rgba(31,39,48,0.08)",
      },
      borderRadius: {
        card: "24px",
        "card-lg": "30px",
        fleet: "34px",
        field: "14px",
      },
      maxWidth: { site: "75rem" },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      },
    },
  },
  plugins: [],
};

export default config;
