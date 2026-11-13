import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rehearsal from "../../eslint-rules/index.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

tester.run("contracts-first", rehearsal.rules["contracts-first"], {
  valid: [
    { code: "type Local = { a: string }; export function f(x: Local) { return x; }" },
    { code: "export const n = 1; export function g() {}" },
    { code: "export interface ButtonProps { label: string }", filename: "src/app/button.tsx" },
    { code: 'export { Panel } from "./panel";' },
  ],
  invalid: [
    { code: "export interface Runner { run(): void }", errors: [{ messageId: "moveToContracts" }] },
    { code: 'export type Mode = "a" | "b";', errors: [{ messageId: "moveToContracts" }] },
    { code: "export enum E { A }", errors: [{ messageId: "moveToContracts" }] },
    { code: "export const S = z.object({ a: z.string() });", errors: [{ messageId: "moveToContracts" }] },
    { code: 'export const E2 = z.enum(["a"]).optional();', errors: [{ messageId: "moveToContracts" }] },
    { code: "export interface ButtonProps { label: string }", filename: "src/lib/x.ts", errors: [{ messageId: "moveToContracts" }] },
    { code: 'export type { A } from "./types";', errors: [{ messageId: "typeReexport" }] },
    { code: 'export { type A, type B } from "./types";', errors: [{ messageId: "typeReexport" }] },
  ],
});

tester.run("finding-cites-krug", rehearsal.rules["finding-cites-krug"], {
  valid: [
    { code: 'const f = { title: "t", category: "clarity", krugPrinciple: "dont-make-me-think" };' },
    { code: 'const f = { ...base, title: "t", category: "clarity" };' },
    { code: 'const s = { title: "t", text: "x" };' },
  ],
  invalid: [
    { code: 'const f = { title: "t", category: "clarity", severity: "low" };', errors: [{ messageId: "missingPrinciple" }] },
    { code: 'out.push({ "title": "t", "category": "navigation" });', errors: [{ messageId: "missingPrinciple" }] },
  ],
});
