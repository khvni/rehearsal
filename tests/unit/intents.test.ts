import { describe, expect, it } from "vitest";
import { Endpoint, Experiment, IntentProfile, VIEWPORTS, type StateGraph } from "@/lib/contracts";
import { makeState } from "@/lib/graph";
import {
  classifyAction,
  classifyGoal,
  detectSiteType,
  discoverEndpoints,
  goalTargetClasses,
  intentForGoal,
  weightEndpoints,
} from "@/lib/intents";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { classifyGoalWithLlm } from "@/lib/intents";

describe("classifyGoal (RFX intents)", () => {
  it.each([
    ["find the conference schedule", "information"],
    ["understand what Acme does", "information"],
    ["read the FAQ about refunds", "information"],
    ["find pricing", "quotation"],
    ["how much does the team plan cost?", "quotation"],
    ["get a quote for 50 seats", "quotation"],
    ["sign up for a free trial", "proposal"],
    ["can I still register?", "proposal"],
    ["contact sales", "proposal"],
    ["apply to attend", "proposal"],
  ] as const)("%s → %s", (goal, expected) => {
    expect(classifyGoal(goal)).toBe(expected);
  });

  it("maps goals to target endpoint classes", () => {
    expect(goalTargetClasses("find pricing")).toEqual(["pricing"]);
    expect(goalTargetClasses("find the conference schedule")).toEqual(["schedule-event"]);
    expect(goalTargetClasses("apply to attend")).toContain("signup");
    expect(intentForGoal("find pricing").weightOverrides).toEqual({ pricing: 1 });
  });

  it("LLM refinement falls back to the deterministic classifier without keys", async () => {
    expect(await classifyGoalWithLlm("find pricing", new FixtureLlmClient())).toBe("quotation");
    const broken = { name: "gemini", complete: async () => "not json" };
    expect(await classifyGoalWithLlm("contact sales", broken)).toBe("proposal");
    const refined = { name: "gemini", complete: async () => JSON.stringify({ category: "quotation" }) };
    expect(await classifyGoalWithLlm("talk to someone", refined)).toBe("quotation");
  });
});

describe("endpoint classification", () => {
  it.each([
    ["Pricing", "https://acme.com/pricing", "pricing"],
    ["See plans", undefined, "pricing"],
    ["Get started", "https://acme.com/get-started", "signup"],
    ["APPLY TO ATTEND", undefined, "signup"],
    ["Talk to sales", "https://acme.com/contact", "contact-form"],
    ["Book a demo", undefined, "contact-form"],
    ["Watch on YouTube ↗", "https://www.youtube.com/watch?v=x", "demo-video"],
    ["Intro", "https://vimeo.com/123", "demo-video"],
    ["FAQ", "https://acme.com/faq", "docs-answers"],
    ["Documentation", undefined, "docs-answers"],
    ["Explore all 50 sessions →", "https://ai.engineer/code/2026/talks", "schedule-event"],
    ["Agenda", undefined, "schedule-event"],
    ["Download the report", "https://acme.com/report.pdf", "download"],
    ["EMAIL UPDATES", "https://ai.engineer/newsletter", "next-steps"],
  ] as const)("%s (%s) → %s", (label, href, expected) => {
    expect(classifyAction({ label, href })).toBe(expected);
  });

  it("ignores links with no endpoint signal", () => {
    expect(classifyAction({ label: "Jason Liu Developer Experience OpenAI", href: "https://ai.engineer/speakers/jason-liu" })).toBeNull();
  });
});

function saasGraph(): StateGraph {
  const home = makeState({
    url: "https://acme.com/",
    viewport: VIEWPORTS.desktop,
    title: "Acme — the platform for teams",
    visibleText: "Acme platform. Sign up for a free trial. Log in. API docs. Integrations.",
    actions: [
      { type: "click", label: "Pricing", role: "link", href: "https://acme.com/pricing", enabled: true, safeToExecute: true },
      { type: "click", label: "Sign up", role: "link", href: "https://acme.com/signup", enabled: true, safeToExecute: true },
      { type: "click", label: "Docs", role: "link", href: "https://acme.com/docs", enabled: true, safeToExecute: true },
    ],
  });
  const pricing = makeState({
    url: "https://acme.com/pricing",
    viewport: VIEWPORTS.desktop,
    title: "Pricing — Acme",
    visibleText: "Plans from $10 per month",
    actions: [{ type: "click", label: "Sign up", role: "link", href: "https://acme.com/signup", enabled: true, safeToExecute: true }],
  });
  return {
    states: [home, pricing],
    edges: [{ fromStateId: home.stateId, actionId: home.actions[0].actionId, toStateId: pricing.stateId }],
  };
}

describe("discoverEndpoints + weightEndpoints", () => {
  it("classifies states and CTAs, merges duplicates, and links stateIds", () => {
    const graph = saasGraph();
    expect(detectSiteType(graph)).toBe("saas");
    const eps = discoverEndpoints(graph);
    const pricing = eps.find((e) => e.class === "pricing")!;
    expect(pricing.stateId).toBe(graph.states[1].stateId);
    expect(pricing.intent).toEqual(["quotation"]);
    expect(eps.filter((e) => e.class === "signup")).toHaveLength(1);
    for (const e of eps) expect(() => Endpoint.parse(e)).not.toThrow();
  });

  it("is deterministic and sorted by weight; overrides lift a class", () => {
    const graph = saasGraph();
    const a = discoverEndpoints(graph);
    expect(JSON.stringify(discoverEndpoints(graph))).toBe(JSON.stringify(a));
    expect(a.map((e) => e.weight)).toEqual([...a.map((e) => e.weight)].sort((x, y) => y - x));
    const docsBefore = a.find((e) => e.class === "docs-answers")!.weight;
    const lifted = weightEndpoints(a, { siteType: "saas", intents: [IntentProfile.parse({ category: "information", goal: "read docs", targetEndpointClasses: ["docs-answers"], weightOverrides: { "docs-answers": 1 } })] });
    expect(lifted.find((e) => e.class === "docs-answers")!.weight).toBeGreaterThan(docsBefore);
    expect(lifted.every((e) => e.weight >= 0 && e.weight <= 1)).toBe(true);
  });

  it("intents/endpoints are optional, additive Experiment fields", () => {
    const base = { id: "e", targetUrl: "https://acme.com/", goal: "find pricing", status: "created", createdAt: "2026-11-13T00:00:00Z", configuration: {} };
    expect(Experiment.parse(base).endpoints).toBeUndefined();
    const graph = saasGraph();
    const full = Experiment.parse({ ...base, graph, intents: [intentForGoal("find pricing")], endpoints: discoverEndpoints(graph) });
    expect(full.intents?.[0].category).toBe("quotation");
  });
});
