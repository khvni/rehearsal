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
    // Fluid Functionalism registry code (shadcn CLI) keeps its upstream component types.
    ignores: [
      "src/lib/contracts/**",
      "src/components/ui/**",
      "src/components/fluid-hover-highlight.tsx",
      "src/hooks/use-fluid-hover.ts",
      "src/lib/{fluid-provider,font-weight,icon-context,key-cap,omit,shape-context,size-context,springs,type-scale,utils}.{ts,tsx}",
    ],
    rules: { "rehearsal/contracts-first": "error" },
  },
  {
    files: ["src/lib/analysis/**/*.ts", "src/lib/intents/**/*.ts"],
    rules: { "rehearsal/finding-cites-krug": "error" },
  },
]);
