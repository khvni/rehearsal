import { defineFn } from "@browserbasehq/sdk-functions";
import { BrowserFunctionParams } from "./src/lib/contracts";
import { StagehandRunner, stagehandModelFromEnv } from "./src/lib/browser/stagehand";
import { errorText } from "./src/lib/browser/types";
import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { AgentRunArgs, DomPatch, TrajectoryArgs, Viewport } from "./src/lib/contracts";

const EXTENSION_ID = process.env.BROWSERBASE_EXTENSION_ID ?? "29075ec7-2db9-4013-adef-4f3b6c718abe";
const EVIDENCE_DIR = "/tmp/rehearsal-evidence";

/** Screenshots written by the runner are returned as base64 so the caller can persist them locally. */
const collectShots = () =>
  readdirSync(EVIDENCE_DIR)
    .filter((f) => f.endsWith(".png"))
    .map((f) => ({ name: basename(f, ".png"), png: readFileSync(`${EVIDENCE_DIR}/${f}`).toString("base64") }));

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
      evidenceDir: EVIDENCE_DIR,
      model: stagehandModelFromEnv(env),
    });
    try {
      const a = params.args;
      switch (params.op) {
        case "openPage": {
          const page = await runner.openPage(String(a.url), a.viewport as Viewport, { patches: a.patches as DomPatch[] | undefined });
          return done({ ok: true, value: { html: page.html, metrics: page.metrics ?? null }, shots: collectShots(), sessionId: context.session.id });
        }
        case "runTrajectory": {
          const run = await runner.runTrajectory(a as unknown as TrajectoryArgs);
          return done({ ok: true, value: { run, shots: collectShots() }, sessionId: context.session.id });
        }
        case "runAgentTask": {
          const run = await runner.runAgentTask(a as unknown as AgentRunArgs);
          return done({ ok: true, value: { run, shots: collectShots() }, sessionId: context.session.id });
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
