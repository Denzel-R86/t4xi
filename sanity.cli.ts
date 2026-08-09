import { defineCliConfig } from "sanity/cli";
import { dataset, projectId } from "./sanity/env";

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
  typegen: {
    enabled: true,
    path: "./sanity/**/*.{ts,tsx,js,jsx}",
    schema: "./sanity/generated/schema.json",
    generates: "./sanity/generated/types.ts",
    overloadClientMethods: true,
    formatGeneratedCode: true,
  },
});
