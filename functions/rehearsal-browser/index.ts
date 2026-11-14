import { defineFn } from "@browserbasehq/sdk-functions";
import { BrowserFunctionParams } from "./src/lib/contracts";
import { StagehandRunner, stagehandModelFromEnv } from "./src/lib/browser/stagehand";
import { errorText } from "./src/lib/browser/types";
import type { AgentRunArgs, DomPatch, TrajectoryArgs, Viewport } from "./src/lib/contracts";

const EXTENSION_ID = process.env.BROWSERBASE_EXTENSION_ID ?? "29075ec7-2db9-4013-adef-4f3b6c718abe";

defineFn(
  "rehearsal-browser",
  async (context, params) => {
    const done = (result: object) => JSON.parse(JSON.stringify(result));
    const env = { ...process.env, ...context.secrets };
    const runner = new StagehandRunner({
      env: "browserbase",
      browserbaseApiKey: env.BROWSERBASE_API_KEY,
      browserbaseSessionId: context.session.id,
      browserbaseExtensionId: EXTENSION_ID,
      model: stagehandModelFromEnv(env),
    });
    try {
      const a = params.args;
      switch (params.op) {
        case "openPage": {
          const page = await runner.openPage(String(a.url), a.viewport as Viewport, { patches: a.patches as DomPatch[] | undefined });
          return done({ ok: true, value: { html: page.html, metrics: page.metrics ?? null }, sessionId: context.session.id });
        }
        case "runTrajectory":
          return done({ ok: true, value: await runner.runTrajectory(a as unknown as TrajectoryArgs), sessionId: context.session.id });
        case "runAgentTask":
          return done({ ok: true, value: await runner.runAgentTask(a as unknown as AgentRunArgs), sessionId: context.session.id });
      }
    } catch (e) {
      return done({ ok: false, error: errorText(e instanceof Error ? e.message : e, 400, env), sessionId: context.session.id });
    } finally {
      await runner.close();
    }
  },
  { parametersSchema: BrowserFunctionParams, sessionConfig: { extensionId: EXTENSION_ID } },
);
