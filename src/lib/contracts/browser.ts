import type { ModelConfig } from "@browserbasehq/stagehand";
import { z } from "zod";
import type {
  AgentJourney,
  Assertion,
  BrandSignals,
  BrowserRun,
  DomPatch,
  JevClient,
  PersonaKind,
  Viewport,
} from "./index";
import type { PageMetrics } from "./metrics";

// Browser backends (src/lib/browser/*): runner interface, trajectory args and runner options.

export interface TrajectoryAction {
  actionId?: string;
  label: string;
  href?: string;
  role?: string;
}

export interface TrajectoryArgs {
  url: string;
  viewport: Viewport;
  actions: TrajectoryAction[];
  assertions: Assertion[];
  /** Reaching any positive alternative satisfies the goal without passing the compiled checks. */
  goalAlternatives?: Assertion[];
  runId: string;
  patches?: DomPatch[];
  maxSteps?: number;
}

/** A candidate element an observe() pass proposes for the next act(). */
export interface AgentCandidate {
  selector: string;
  description: string;
  method?: string;
}

/** What an observe() candidate's selector resolves to on the page (its nearest form control, if any). */
export interface AgentTargetInfo {
  tag: string;
  type?: string;
  role?: string;
  inForm: boolean;
  editable: boolean;
}

/** The observe/act/extract surface an agent loop drives — Stagehand-backed, or a fixture in tests. */
export interface AgentDriver {
  observe(instruction?: string): Promise<AgentCandidate[]>;
  /** Resolve a candidate selector to its element facts; null when it doesn't resolve. */
  inspect(selector: string): Promise<AgentTargetInfo | null>;
  /** Run `target` (a vetted click/scroll candidate) with `instruction` as its trusted description. */
  act(instruction: string, target: AgentCandidate): Promise<{ ok: boolean; detail?: string }>;
  extract(instruction: string, schema?: unknown): Promise<unknown>;
  probe(): AssertionProbe;
}

/** TrajectoryArgs plus the visitor goal, for agent-driven verify runs. */
export interface AgentRunArgs extends TrajectoryArgs {
  goal: string;
}

/** One persona-agent journey over the live site (the swarm's unit of work). */
export interface PersonaJourneyArgs {
  /** Stable agent id, e.g. "agent-0042"; also prefixes screenshots. */
  agentId: string;
  url: string;
  viewport: Viewport;
  persona: PersonaKind;
  goal: string;
  /** Goal assertions (compiled + endpoint-derived) checked on each snapshot. */
  assertions: Assertion[];
  seed: number;
  maxSteps: number;
  /** Decision client injected by the caller; runners fall back to their own selectJev() when absent (a serialized Function invocation ignores it — the function selects from its own env). */
  jev?: JevClient;
}

export interface OpenPageResult {
  html: string;
  /** Absent on runtimes without a writable evidence dir (e.g. workerd). */
  screenshotPath?: string;
  /** Layout metrics from the `measurePage` hook, taken in the same session as the screenshot. */
  metrics?: PageMetrics;
  /** Computed design tokens captured in the same session (the `captureBrand` hook). */
  brand?: BrandSignals;
}

/**
 * A browser backend. `openPage` captures one state (rendered HTML + screenshot)
 * and releases its session before returning; `runTrajectory` executes a
 * multi-step action sequence and checks assertions.
 */
export interface BrowserRunner {
  readonly name: string;
  /** True when `runAgentTask` is usable (backend has a model). Absent/false => verify uses runTrajectory. */
  readonly supportsAgent?: boolean;
  openPage(
    url: string,
    viewport: Viewport,
    opts?: { patches?: DomPatch[]; shotName?: string; scope?: string },
  ): Promise<OpenPageResult>;
  runTrajectory(args: TrajectoryArgs): Promise<BrowserRun>;
  /**
   * Agent-driven trajectory: observe/act/extract loop instead of scripted locators.
   * Present only on backends with a configured model (e.g. Stagehand); the verify
   * stage falls back to `runTrajectory` when absent (AGENTS.md rule 4).
   */
  runAgentTask?(args: AgentRunArgs): Promise<BrowserRun>;
  /**
   * Drop sessions pooled across `openPage` calls (runners may reuse one session
   * for a whole crawl). Called by the orchestrator when a discover stage ends;
   * per-call sessions close themselves regardless. `scope` releases only the
   * sessions opened under that `openPage` scope so concurrent runs sharing one
   * runner never close each other's captures; omit it to release everything.
   */
  releaseCaptures?(scope?: string): Promise<void>;
  /**
   * Persona-agent journey: one agent navigates from `url`, deciding each step
   * with a batched Jev scoring call until it reaches the goal or drops off.
   * Present only on backends that can run the loop (Function runner, Stagehand,
   * Playwright, fixture sites); simulate falls back to seeded sampling when absent.
   */
  runPersonaJourney?(args: PersonaJourneyArgs): Promise<AgentJourney>;
  close(): Promise<void>;
}

/** What one persona agent sees of the current page — the decision input. */
export interface PersonaSnapshot {
  url: string;
  title: string;
  visibleText: string;
  /** Every extracted action — hashed exactly like discovery so journey stateHashes match crawled states. */
  actions: { label: string; role?: string }[];
  /** Actionable candidates (enabled + safeToExecute), in DOM order. */
  candidates: TrajectoryAction[];
}

/** The browser surface a persona journey drives — implemented per runner. */
export interface PersonaDriver {
  snapshot(): Promise<PersonaSnapshot>;
  act(action: TrajectoryAction): Promise<{ ok: boolean; error?: string }>;
  probe(): AssertionProbe;
  /** Best-effort screenshot at drop-off; returns a path or null. */
  screenshot(name: string): Promise<string | null>;
}

/** Minimal page surface both Playwright's Page and Stagehand's Page satisfy (LivePagePersonaDriver). */
export interface PersonaPage {
  evaluate<T>(expression: string): Promise<T>;
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  getByRole(
    role: string,
    options?: { name?: string; exact?: boolean },
  ): { first(): { click(options?: { timeout?: number }): Promise<void> } };
  waitForLoadState(state?: string, options?: { timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  url(): string | Promise<string>;
  screenshot(options?: { timeout?: number }): Promise<Uint8Array>;
  title(): Promise<string>;
}

/** Minimal page surface needed to evaluate assertions, implemented by every backend. */
export interface AssertionProbe {
  bodyText(): Promise<string>;
  isVisible(selector: string): Promise<boolean>;
  count(selector: string): Promise<number>;
  title(): Promise<string>;
  url(): Promise<string>;
}

export type EnvVars = Record<string, string | undefined>;

export type RunnerPreference = "auto" | "browserbase-function" | "stagehand" | "stagehand-local" | "playwright";

export type StagehandEnv = "browserbase" | "local";

export interface StagehandRunnerOptions {
  env: StagehandEnv;
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
  /** Attach to this existing Browserbase session instead of creating one (inside a Browserbase Function). */
  browserbaseSessionId?: string;
  /** Pre-uploaded Stagehand extension; avoids the per-session upload from disk. */
  browserbaseExtensionId?: string;
  /** Local Chrome/Chromium binary for env=local (Stagehand does not bundle a browser). */
  executablePath?: string;
  /** Chromium sandbox for env=local; defaults to chromiumSandboxEnabled(process.env). */
  chromiumSandbox?: boolean;
  model?: ModelConfig;
  evidenceDir?: string;
  /** Jev client for persona journeys; defaults to selectJev() (env-resolved). */
  jev?: JevClient;
}

export interface PlaywrightStepOptions {
  /** Navigation timeout for goto/load waits. */
  navTimeoutMs: number;
  /** Prefer clicking a same-origin link over page.goto (keeps remote sessions on one in-page flow). */
  preferClick: boolean;
}

/** Anything with a string-expression `evaluate` — Playwright pages (local or CDP) and Stagehand pages. */
export interface EvaluatingPage {
  evaluate(expression: string): Promise<unknown>;
}

/** One browser operation shipped to the Browserbase Function (functions/rehearsal-browser). */
export const BrowserFunctionParams = z.object({
  op: z.enum(["openPage", "runTrajectory", "runAgentTask", "runPersonaJourney"]),
  args: z.record(z.string(), z.unknown()),
});
export type BrowserFunctionParams = z.infer<typeof BrowserFunctionParams>;

export interface BrowserbaseFunctionRunnerOptions {
  apiKey: string;
  functionId: string;
  /** Pre-uploaded Stagehand extension id, sent as sessionCreateParams.extensionId. */
  extensionId?: string;
  /** Directory screenshots are written to (best-effort; read-only runtimes keep remote names). */
  evidenceDir?: string;
  /** Total wait per invocation, invoke to terminal status. */
  timeoutMs?: number;
  pollMs?: number;
  apiBase?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}
