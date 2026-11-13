import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import rehearsal from "./eslint-rules/index.mjs";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "node_modules/**", "data/**", "playwright-report/**", "test-results/**"]),
  {
    plugins: { rehearsal },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "warn",
    },
  },
  {
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/contracts/**"],
    rules: { "rehearsal/contracts-first": "error" },
  },
  {
    files: ["src/lib/analysis/**/*.ts", "src/lib/intents/**/*.ts"],
    rules: { "rehearsal/finding-cites-krug": "error" },
  },
]);
