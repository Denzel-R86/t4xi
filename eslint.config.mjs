import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextCoreWebVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "sanity/generated/**",
  ]),
  {
    files: [
      "components/booking/BookingSection.tsx",
      "components/booking/FlightCard.tsx",
      "components/dashboard/InvoiceOperations.tsx",
      "components/horizon/motion.tsx",
      "components/shared/AddressAutocomplete.tsx",
      "components/shared/useRouteQuote.ts",
      "components/tarieven/RouteFinder.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
