import { z } from "zod";

// Code sandbox (src/lib/sandbox/*): executes agent-generated test code against a
// fixture/rebuilt page or a live URL and returns assertions, console output and errors.

/** What sandboxed test code runs against: static HTML (fixture or rebuilt mockup) or a live URL. */
export const SandboxTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("html"), html: z.string(), url: z.string().url().optional() }),
  z.object({ kind: z.literal("url"), url: z.string().url() }),
]);
export type SandboxTarget = z.infer<typeof SandboxTarget>;

export const SandboxConsoleEntry = z.object({
  level: z.enum(["log", "warn", "error"]),
  text: z.string(),
});
export type SandboxConsoleEntry = z.infer<typeof SandboxConsoleEntry>;

export const SandboxAssertion = z.object({
  name: z.string(),
  passed: z.boolean(),
  error: z.string().optional(),
});
export type SandboxAssertion = z.infer<typeof SandboxAssertion>;

export const SandboxRunArgs = z.object({
  /** JS test source. Runs with `assert(name, cond)`, `console`, `page`, and `report(obj)` in scope. */
  code: z.string().max(64_000),
  target: SandboxTarget,
  timeoutMs: z.number().int().positive().max(60_000).optional(),
});
export type SandboxRunArgs = z.infer<typeof SandboxRunArgs>;

export const SandboxRunResult = z.object({
  /** Every assertion passed and no uncaught error. */
  success: z.boolean(),
  assertions: z.array(SandboxAssertion),
  console: z.array(SandboxConsoleEntry),
  errors: z.array(z.string()),
  /** Optional structured value the code produced via `report(...)`. */
  output: z.unknown().optional(),
  durationMs: z.number().int().nonnegative(),
});
export type SandboxRunResult = z.infer<typeof SandboxRunResult>;

/** Read-only DOM surface test code asserts against (`page` in the sandbox scope). */
export interface SandboxPage {
  url(): string;
  title(): string;
  /** textContent of the first match, or the whole body when no selector is given. */
  text(selector?: string): string;
  count(selector: string): number;
  exists(selector: string): boolean;
  attr(selector: string, name: string): string | undefined;
}

/**
 * Executes agent-generated test code in an isolated context.
 * Adapters must degrade to a keyless implementation rather than crash (AGENTS.md rule 4).
 */
export interface CodeSandbox {
  readonly name: string;
  run(args: SandboxRunArgs): Promise<SandboxRunResult>;
}

export type SandboxPreference = "auto" | "node" | "cloudflare";
