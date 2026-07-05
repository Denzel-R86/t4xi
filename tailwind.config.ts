import type { Config } from "tailwindcss";

/**
 * T4XI Design System — officieel kleurenschema
 * Licht, warm en premium: Stone Fog achtergrond, witte cards,
 * donkere ink header/footer, Stone als accent.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fog: "#F7F5F2",        // pagina-achtergrond
        card: "#FFFFFF",       // cards
        ink: {
          DEFAULT: "#28313B",  // header/footer + primaire tekst
          hover: "#1F2730",    // hover-state
        },
        stone: {
          text: "#6E6B69",    // accent-tekst op licht (WCAG AA, 5.0:1 op fog)
          DEFAULT: "#999694",  // accent
          subtle: "#CBC8C4",   // subtiele vlakken
        },
        line: "#D8D5D1",       // borders
        secondary: "#666666",  // secundaire tekst
      },
      fontFamily: {
        display: ["var(--font-outfit)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["clamp(2.75rem, 6vw, 4.5rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "display-lg": ["clamp(2rem, 4vw, 3rem)", { lineHeight: "1.1", letterSpacing: "-0.015em" }],
        "display-md": ["clamp(1.5rem, 2.5vw, 2rem)", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        eyebrow: ["0.8125rem", { lineHeight: "1", letterSpacing: "0.14em" }],
      },
      maxWidth: { site: "72rem" },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
