import { describe, expect, it, vi } from "vitest";
import type { AgentJourney, BrowserRunner, BrowserRun, OpenPageResult, PersonaJourneyArgs, SharedLanding } from "@/lib/contracts";
import { ExperimentConfig as Config, VIEWPORTS } from "@/lib/contracts";
import { personaJourneyLoop } from "@/lib/simulation/persona";
import { extractPage } from "@/lib/browser/extract";
import { runPersonaSwarm } from "@/lib/simulation/swarm";
import { FixtureJevClient } from "@/lib/decisions/jev";

const CONFIG = Config.parse({
  maxAgents: 24,
  maxStepsPerAgent: 8,
  maxConcurrentAgents: 4,
  viewports: ["desktop"],
  trajectories: 50,
  verifyCount: 2,
});

const BASE = "https://aie.example.com";
const SCHEDULE = [{ kind: "text-present" as const, value: "schedule" }];

const htmlFor = (pathname: string) =>
  `<html><head><title>${pathname}</title></head><body><h1>${pathname}</h1><p>conference schedule talks workshops</p><a href="${BASE}/schedule">Schedule</a></body></html>`;

function runner(opts?: { landing?: SharedLanding; failCapture?: boolean }) {
  const seenLandings: (SharedLanding | undefined)[] = [];
  let captures = 0;
  const r: BrowserRunner & { captures: number; seenLandings: (SharedLanding | undefined)[] } = {
    name: "landing-runner",
    captures,
    seenLandings,
    async openPage(): Promise<OpenPageResult> {
      return { html: "" };
    },
    async runTrajectory(): Promise<BrowserRun> {
      throw new Error("unused");
    },
    async runPersonaJourney(a: PersonaJourneyArgs): Promise<AgentJourney> {
      seenLandings.push(a.landing);
      const extract = extractPage;
      let current = a.url;
      const driver = {
        snapshot: async () => {
          const ex = extract(htmlFor(new URL(current).pathname), current);
          return {
            url: current,
            title: ex.title,
            visibleText: ex.visibleText,
            actions: ex.actions.map((x) => ({ label: x.label, role: x.role })),
            candidates: ex.actions
              .map((x, i) => ({ x, actionId: `act_${i}` }))
              .filter(({ x }) => x.enabled && x.safeToExecute)
              .map(({ x, actionId }) => ({ actionId, label: x.label, href: x.href, role: x.role })),
          };
        },
        act: async (action: { href?: string }) => {
          if (action.href) current = action.href;
          return { ok: true };
        },
        probe: () => {
          const ex = extract(htmlFor(new URL(current).pathname), current);
          return {
            bodyText: async () => ex.visibleText,
            isVisible: async () => false,
            count: async () => 0,
            title: async () => ex.title,
            url: async () => current,
          };
        },
        screenshot: async () => null,
      };
      return personaJourneyLoop(driver, new FixtureJevClient(), a);
    },
    async close() {},
  };
  if (opts?.landing !== undefined || opts?.failCapture) {
    r.captureLandingPage = async () => {
      captures++;
      if (opts?.failCapture) throw new Error("robots.txt disallows /");
      return opts!.landing!;
    };
  }
  Object.defineProperty(r, "captures", { get: () => captures });
  return r;
}

const args = {
  url: BASE,
  goal: "find the conference schedule",
  assertions: SCHEDULE,
  config: CONFIG,
  viewport: VIEWPORTS.desktop,
};

describe("runPersonaSwarm landing capture", () => {
  it("captures the landing page once and threads it into every journey", async () => {
    const landing: SharedLanding = {
      url: BASE,
      status: 200,
      headers: { "content-type": "text/html" },
      body: Buffer.from(htmlFor("/")).toString("base64"),
    };
    const r = runner({ landing });
    const swarm = await runPersonaSwarm({ ...args, runner: r });
    expect(r.captures).toBe(1);
    expect(r.seenLandings.length).toBe(CONFIG.maxAgents);
    expect(r.seenLandings.every((l) => l === landing)).toBe(true);
    expect(swarm.journeys.length).toBe(CONFIG.maxAgents);
  });

  it("produces identical journeys whether or not a landing is shared", async () => {
    const landing: SharedLanding = {
      url: BASE,
      status: 200,
      headers: { "content-type": "text/html" },
      body: Buffer.from(htmlFor("/")).toString("base64"),
    };
    const shared = await runPersonaSwarm({ ...args, runner: runner({ landing }) });
    const unshared = await runPersonaSwarm({ ...args, runner: runner() });
    expect(JSON.stringify(shared)).toBe(JSON.stringify(unshared));
  });

  it("falls back to per-agent fetches when the capture fails", async () => {
    const failing = runner({ failCapture: true });
    const swarm = await runPersonaSwarm({ ...args, runner: failing });
    expect(swarm.journeys.length).toBe(CONFIG.maxAgents);
    expect(failing.seenLandings.every((l) => l === undefined)).toBe(true);
  });
});

describe("captureLandingPage", () => {
  it("keeps each hop's Set-Cookie with its URL and stores the raw body", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const respond = (u: string, status: number, headers: Record<string, string>, body?: string) => {
      const res = new Response(body, { status, headers });
      Object.defineProperty(res, "url", { value: u });
      return res;
    };
    vi.stubGlobal("fetch", async (raw: string | URL) => {
      const u = String(raw);
      if (u.endsWith("/robots.txt")) return respond(u, 200, { "content-type": "text/plain" }, "User-agent: *\nAllow: /\n");
      if (u.endsWith("/start")) return respond(u, 302, { location: "/final", "set-cookie": "hop=1" });
      return respond(u, 200, { "content-type": "text/html", "set-cookie": "sess=abc; Path=/" }, "<html><body>final</body></html>");
    });
    try {
      const { PlaywrightRunner } = await import("@/lib/browser/playwright");
      const landing = await new PlaywrightRunner().captureLandingPage("http://127.0.0.1:1/start");
      expect(landing.url).toBe("http://127.0.0.1:1/final");
      // Path-less cookies keep their hop URL so replay derives the right default path.
      expect(landing.cookies).toEqual([
        { url: "http://127.0.0.1:1/start", header: "hop=1" },
        { url: "http://127.0.0.1:1/final", header: "sess=abc; Path=/" },
      ]);
      expect(Buffer.from(landing.body, "base64").toString()).toBe("<html><body>final</body></html>");
      expect(landing.headers["set-cookie"]).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
