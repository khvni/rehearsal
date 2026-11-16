import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentJourney, PersonaJourneyArgs } from "@/lib/contracts";
import { VIEWPORTS } from "@/lib/contracts";

// The runners under test import "../fetch/guards"; mock it so robotsAllows and
// politeDelay are observable spies over the real implementations and
// assertPublicUrl never does a real DNS lookup (same pattern as
// agent-runner.test.ts).
const hoisted = vi.hoisted(() => ({
  realGuards: undefined as unknown as typeof import("@/lib/fetch/guards"),
  launchAttempts: [] as number[],
}));
vi.mock("@/lib/fetch/guards", async (importOriginal) => {
  hoisted.realGuards = await importOriginal<typeof import("@/lib/fetch/guards")>();
  return {
    ...hoisted.realGuards,
    assertPublicUrl: vi.fn(async (raw: string) => new URL(raw)),
    robotsAllows: vi.fn(hoisted.realGuards.robotsAllows),
    politeDelay: vi.fn(hoisted.realGuards.politeDelay),
  };
});

// Stagehand's dynamic import stays mocked: launch records when the runner tried
// to open a browser session, then refuses so nothing real launches.
vi.mock("@browserbasehq/stagehand", () => ({
  Stagehand: { create: vi.fn() },
  browserbase: {
    launch: vi.fn(async () => {
      hoisted.launchAttempts.push(Date.now());
      throw new Error("sentinel: would have launched a browserbase session");
    }),
    connect: vi.fn(),
  },
  localBrowser: {
    launch: vi.fn(async () => {
      hoisted.launchAttempts.push(Date.now());
      throw new Error("sentinel: would have launched a local browser");
    }),
  },
}));

import { BrowserbaseFunctionRunner } from "@/lib/browser/function-runner";
import { StagehandRunner } from "@/lib/browser/stagehand";
import { politeDelay, robotsAllows } from "@/lib/fetch/guards";

const mockedRobots = vi.mocked(robotsAllows);
const mockedDelay = vi.mocked(politeDelay);

const journeyArgs = (url: string, agentId = "agent-0000"): PersonaJourneyArgs => ({
  agentId,
  url,
  viewport: VIEWPORTS.desktop,
  persona: "info-seeker",
  goal: "find the schedule",
  assertions: [],
  seed: 1,
  maxSteps: 4,
});

const journeyResult: AgentJourney = {
  agentId: "agent-0000",
  persona: "info-seeker",
  seed: 1,
  steps: [],
  outcome: "dropped-off",
  backtracks: 0,
};

/** fetchImpl stub for the Function API: records each invoke's fake-time, answers COMPLETED. */
function functionApi() {
  const invokeTimes: number[] = [];
  const fetchImpl = vi.fn(async (raw: string | URL) => {
    const u = String(raw);
    if (u.endsWith("/invoke")) {
      invokeTimes.push(Date.now());
      return new Response(
        JSON.stringify({
          id: "inv_1",
          status: "COMPLETED",
          results: { ok: true, value: { journey: journeyResult, shots: [] } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ id: "inv_1", status: "COMPLETED", results: {} }), { status: 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, invokeTimes };
}

function functionRunner(fetchImpl: typeof fetch) {
  return new BrowserbaseFunctionRunner({
    apiKey: "bb",
    functionId: "fn_1",
    fetchImpl,
    sleep: async () => {},
    pollMs: 10,
    timeoutMs: 60_000,
  });
}

beforeEach(() => {
  hoisted.launchAttempts.length = 0;
  // Fake only the clock APIs politeDelay needs (setTimeout + Date): faking
  // nextTick/setImmediate stalls vitest's dynamic import resolution used by
  // StagehandRunner.withSession.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  mockedRobots.mockReset();
  mockedDelay.mockReset();
  mockedRobots.mockImplementation(hoisted.realGuards.robotsAllows);
  mockedDelay.mockImplementation(hoisted.realGuards.politeDelay);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
});

describe("BrowserbaseFunctionRunner politeness", () => {
  it("never invokes the Function when robots.txt disallows the URL", async () => {
    mockedRobots.mockResolvedValue(false);
    const { fetchImpl } = functionApi();
    const runner = functionRunner(fetchImpl);
    await expect(runner.runPersonaJourney(journeyArgs("https://blocked.example.com/"))).rejects.toThrow(
      /robots\.txt disallows/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mockedDelay).not.toHaveBeenCalled();
  });

  it("checks the live robots.txt — a Disallow blocks the invocation", async () => {
    // Real robotsAllows against a stubbed network: Disallow must reach the runner.
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("User-agent: *\nDisallow: /\n", { status: 200, headers: { "content-type": "text/plain" } }),
      ),
    );
    const { fetchImpl } = functionApi();
    const runner = functionRunner(fetchImpl);
    await expect(runner.runPersonaJourney(journeyArgs("http://127.0.0.1:9/"))).rejects.toThrow(/robots\.txt disallows/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("spaces concurrent swarm journeys to one invocation per 2s per host", async () => {
    mockedRobots.mockResolvedValue(true);
    const { fetchImpl, invokeTimes } = functionApi();
    const runner = functionRunner(fetchImpl);
    const calls = Array.from({ length: 4 }, (_, i) =>
      runner.runPersonaJourney(journeyArgs("https://swarm-fn.example.com/", `agent-${i}`)),
    );
    await vi.advanceTimersByTimeAsync(9000);
    await Promise.all(calls);
    const times = invokeTimes.sort((a, b) => a - b).map((t) => t - invokeTimes[0]);
    expect(times).toEqual([0, 2000, 4000, 6000]);
  });

  it("keeps hosts independent", async () => {
    mockedRobots.mockResolvedValue(true);
    const { fetchImpl, invokeTimes } = functionApi();
    const runner = functionRunner(fetchImpl);
    const calls = [
      runner.runPersonaJourney(journeyArgs("https://a.example.com/", "a-1")),
      runner.runPersonaJourney(journeyArgs("https://a.example.com/", "a-2")),
      runner.runPersonaJourney(journeyArgs("https://b.example.com/", "b-1")),
    ];
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all(calls);
    const times = invokeTimes.sort((a, b) => a - b).map((t) => t - invokeTimes[0]);
    expect(times).toEqual([0, 0, 2000]);
  });
});

describe("StagehandRunner politeness", () => {
  it("refuses a robots-disallowed URL before launching a session", async () => {
    mockedRobots.mockResolvedValue(false);
    const runner = new StagehandRunner({ env: "local", evidenceDir: "/tmp/x" });
    await expect(runner.runPersonaJourney(journeyArgs("https://blocked.example.com/"))).rejects.toThrow(
      /robots\.txt disallows/,
    );
    await expect(runner.openPage("https://blocked.example.com/", VIEWPORTS.desktop)).rejects.toThrow(
      /robots\.txt disallows/,
    );
    expect(hoisted.launchAttempts).toEqual([]);
    expect(mockedDelay).not.toHaveBeenCalled();
  });

  it("applies per-host spacing before opening a browser session", async () => {
    mockedRobots.mockResolvedValue(true);
    const runner = new StagehandRunner({ env: "local", evidenceDir: "/tmp/x" });
    // Sequential journeys: concurrent `await import("@browserbasehq/stagehand")`
    // calls deadlock in vite-node's module runner, so spacing is observed across
    // back-to-back launches instead of racing ones.
    const first = runner
      .runPersonaJourney(journeyArgs("https://swarm-sh.example.com/", "agent-0"))
      .catch(() => undefined); // rejects at the mocked launch
    await vi.advanceTimersByTimeAsync(1000);
    await first;
    const second = runner
      .runPersonaJourney(journeyArgs("https://swarm-sh.example.com/", "agent-1"))
      .catch(() => undefined);
    await vi.advanceTimersByTimeAsync(3000);
    await second;
    const times = hoisted.launchAttempts.sort((a, b) => a - b).map((t) => t - hoisted.launchAttempts[0]);
    expect(times).toEqual([0, 2000]);
  });

  it("checks robots before it waits (gate order matches the local runner)", async () => {
    mockedRobots.mockResolvedValue(true);
    const runner = new StagehandRunner({ env: "local", evidenceDir: "/tmp/x" });
    await runner.runPersonaJourney(journeyArgs("https://swarm2.example.com/", "agent-0")).catch(() => undefined);
    expect(mockedRobots.mock.invocationCallOrder[0]).toBeLessThan(mockedDelay.mock.invocationCallOrder[0]);
    expect(String(mockedDelay.mock.calls[0][0])).toBe("https://swarm2.example.com/");
  });

  it("skips the gate inside the Function — the caller already gated", async () => {
    // Each Function invocation is a fresh process: re-gating would refetch
    // robots.txt per invocation and its per-host map could not space calls.
    const runner = new StagehandRunner({
      env: "local",
      evidenceDir: "/tmp/x",
      politenessHandledByCaller: true,
    });
    await runner
      .runPersonaJourney(journeyArgs("https://swarm-inner.example.com/", "agent-0"))
      .catch(() => undefined);
    expect(mockedRobots).not.toHaveBeenCalled();
    expect(mockedDelay).not.toHaveBeenCalled();
    expect(hoisted.launchAttempts).toHaveLength(1);
  });
});
