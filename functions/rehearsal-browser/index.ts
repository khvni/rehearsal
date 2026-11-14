import { defineFn } from "@browserbasehq/sdk-functions";
import { BrowserFunctionParams } from "./src/lib/contracts";
import { StagehandRunner, stagehandModelFromEnv } from "./src/lib/browser/stagehand";
import { errorText } from "./src/lib/browser/types";
import type { AgentRunArgs, DomPatch, PersonaJourneyArgs, TrajectoryArgs, Viewport } from "./src/lib/contracts";
import { selectJev } from "./src/lib/decisions/jev";

const EXTENSION_ID = process.env.BROWSERBASE_EXTENSION_ID ?? "29075ec7-2db9-4013-adef-4f3b6c718abe";
const EVIDENCE_DIR = "/tmp/rehearsal-evidence";

defineFn(
  "rehearsal-browser",
  async (context, params) => {
    const done = (result: object) => JSON.parse(JSON.stringify(result));
    const env = { ...process.env, ...context.secrets };
    const runner = new StagehandRunner({
      env: "browserbase",
      browserbaseApiKey: env.BROWSERBASE_API_KEY,
      browserbaseSessionId: context.session.id,
      evidenceDir: EVIDENCE_DIR,
      model: stagehandModelFromEnv(env),
      jev: selectJev(env), // context.secrets carry JEV_API_KEY/OPENROUTER_API_KEY, not process.env
    });
    try {
      const a = params.args;
      switch (params.op) {
        case "openPage": {
          const page = await runner.openPage(String(a.url), a.viewport as Viewport, { patches: a.patches as DomPatch[] | undefined });
          return done({ ok: true, value: { html: page.html.slice(0, 40_000), metrics: page.metrics ?? null }, sessionId: context.session.id });
        }
        case "runTrajectory": {
          const run = await runner.runTrajectory(a as unknown as TrajectoryArgs);
          return done({ ok: true, value: { run }, sessionId: context.session.id });
        }
        case "runAgentTask": {
          const run = await runner.runAgentTask(a as unknown as AgentRunArgs);
          return done({ ok: true, value: { run }, sessionId: context.session.id });
        }
        case "runPersonaJourney": {
          const journey = await runner.runPersonaJourney(a as unknown as PersonaJourneyArgs);
          return done({ ok: true, value: { journey }, sessionId: context.session.id });
        }
      }
    } catch (e) {
      return done({ ok: false, error: errorText(e instanceof Error ? e.message : e, 400, env), sessionId: context.session.id });
    } finally {
      await runner.close();
    }
  },
  { parametersSchema: BrowserFunctionParams, sessionConfig: { extensionId: EXTENSION_ID } },
);
