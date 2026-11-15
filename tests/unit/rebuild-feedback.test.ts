import { act, createElement, type HTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RebuildPage from "@/app/experiments/[id]/rebuild/page";
import { Experiment } from "@/lib/contracts";
import { rollupBrand } from "@/lib/rebuild";
import { deterministicPlan, planSite } from "@/lib/rebuild/site";
import storedExperiment from "../fixtures/experiments/aie-code-2026.json";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "exp_1234abcd" }) }));
vi.mock("@/components/ui/banner", () => ({
  Banner: ({ children, role }: { children: ReactNode; role?: string }) => createElement("div", { role }, children),
  BannerTitle: ({ children }: { children: ReactNode }) => createElement("strong", null, children),
  BannerDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled }: HTMLAttributes<HTMLButtonElement> & { disabled?: boolean }) =>
    createElement("button", { onClick, disabled }, children),
}));

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  const { window } = parseHTML("<html><body><div id='root'></div></body></html>");
  vi.stubGlobal("window", window);
  vi.stubGlobal("self", window);
  vi.stubGlobal("document", window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = window.document.getElementById("root")!;
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

function experiment() {
  const exp = Experiment.parse(storedExperiment);
  exp.id = "exp_1234abcd";
  exp.status = "complete";
  exp.rebuild = {
    generatedAt: exp.createdAt,
    brand: rollupBrand(exp.graph?.states ?? []),
    goals: [], pages: [], llm: "openrouter",
  };
  return exp;
}

async function render(exp: Experiment) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(exp)));
  await act(async () => root.render(createElement(RebuildPage)));
}

describe("rebuild fallback feedback", () => {
  it.each(["provider", "invalid JSON"])("shows a site planner %s fallback on the dashboard", async (failure) => {
    const exp = experiment();
    exp.rebuild!.site = await planSite(exp, {
      name: "openrouter",
      complete: async () => {
        if (failure === "provider") throw new Error("OpenRouter planner failed: 429");
        return "truncated JSON";
      },
    });
    expect(exp.rebuild!.site.plannerSource).toBe("template");
    expect(exp.rebuild!.llmError).toBeUndefined();
    await render(exp);
    const warning = container.querySelector('[role="status"]');
    expect(warning?.textContent).toContain("Site plan uses a template");
    expect(warning?.textContent).toContain(exp.rebuild!.site.plannerError);
    expect(container.textContent).toContain("Open rebuilt site");
  });

  it("labels a template plan even when an older record has no planner error", async () => {
    const exp = experiment();
    exp.rebuild!.site = deterministicPlan(exp);
    await render(exp);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Site plan uses a template");
  });

  it("does not warn for a successful LLM site plan", async () => {
    const exp = experiment();
    exp.rebuild!.site = await planSite(exp, { name: "openrouter", complete: async () => JSON.stringify(deterministicPlan(exp)) });
    expect(exp.rebuild!.site.plannerSource).toBe("llm");
    await render(exp);
    expect(container.textContent).not.toContain("Site plan uses a template");
    expect(container.textContent).not.toContain("copy unavailable");
  });

  it("keeps the legacy goal-page fallback warning", async () => {
    const exp = experiment();
    exp.rebuild!.llmError = "Legacy copy request failed";
    await render(exp);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("openrouter copy unavailable — pages use templates");
    expect(container.textContent).toContain("Legacy copy request failed");
  });
});
