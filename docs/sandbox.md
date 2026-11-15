# Browser agent + code sandbox

How Rehearsal's agent executes browser flows and runs generated test code, and why the
pieces look the way they do.

## Research summary (what we evaluated)

- **Stagehand v4** (`@browserbasehq/stagehand` 4.4, already vendored) — exposes
  `observe(instruction)` → candidate elements `{selector, description, method}`,
  `act(instruction)` → self-healing action, `extract(instruction, schema)` → typed data.
  Runs on Browserbase remote sessions or local Chrome. Stagehand v4 cannot run inside
  workerd: module load reads `import.meta.url`, launch uploads an extension zip from disk,
  and its CDP WebSocket times out — so on the Worker, browser work runs inside a
  Browserbase Function (`functions/rehearsal-browser`, published with
  `npm run functions:publish`), reached through `BrowserbaseFunctionRunner`.
- **Vercel Labs `agent-browser`** — a Rust CLI daemon that drives Chrome over CDP one
  shell command at a time: `snapshot` returns the page as a compact accessibility tree
  with refs (`@e1`), the agent clicks a ref, snapshots again, repeats. It supports remote
  providers (Browserbase, Browserless) and `--cdp` attach. It is a *driving tool* for an
  agent harness, not an embeddable library — but its loop (snapshot → refs → act →
  re-snapshot) is the model `agent.ts` follows with Stagehand's observe/act/extract.
- **Cloudflare Sandbox SDK** (`@cloudflare/sandbox` 1.x) — a sandbox is a Durable Object
  plus the `Container` it starts on `this.ctx.container`; `Files`/`S3Mount`/
  `DirectoryBackup` add what the raw Container API lacks (file streaming, S3 mounts,
  backup/restore). The 1.x SDK ships no `getSandbox` helper — the app authors the
  `Sandbox` Durable Object itself (`getByName(id).run(script)` → `{exitCode, stdout}`).
  This is the only way to execute generated code from a Worker (workerd forbids
  `eval`/`new Function` and has no `node:worker_threads`). It needs a `containers` +
  Durable Object binding and Containers access on the account — see "Enabling the
  Cloudflare adapter" below.

## `CodeSandbox` (src/lib/sandbox)

`CodeSandbox.run({ code, target, timeoutMs })` executes agent-generated JS test code and
returns `SandboxRunResult` — assertions, captured console, errors, optional `report()`
output. The target is `SandboxTarget`: `{kind:"html"}` for a fixture or rebuilt mockup,
`{kind:"url"}` for a live page (resolved through `assertPublicUrl` + `fetchPublic` before
the sandbox starts, so sandboxed code never gets network).

The code's scope is deliberately small: `assert(name, cond)`, `console`, `page`
(a read-only `SandboxPage` over a linkedom document: `text`, `count`, `exists`, `attr`,
`title`, `url`), `report(value)`, and language builtins. No `require`, `process`, `fetch`.

### Adapters — `selectSandbox(env)` from `REHEARSAL_SANDBOX`

| `auto` (default) | `cloudflare` | `node` |
|---|---|---|
| Cloudflare adapter when a `Sandbox` binding resolves, else node | Cloudflare, falling back to node with a logged warning when unbound | node worker, always |

- **node** (`sandbox/node.ts`, `node-vm-worker`) — the CI/dev path, zero keys, fully
  hermetic on `kind:"html"` targets. Belt and suspenders: `node:vm` isolates the API
  surface (only the listed globals exist); `node:worker_threads` isolates the process so
  a hard timeout can `terminate()` a stuck loop. All heavy imports are lazy, keeping the
  module graph clean on workerd.
- **cloudflare** (`sandbox/cloudflare.ts`, `cloudflare-sandbox`) — the Workers path.
  Resolves `env.Sandbox` via `getCloudflareContext({async:true})`, gets a stub with
  `getByName(name).run(script)`, ships a self-contained harness (`node harness.cjs` on a
  base64 payload) into the container, and parses the last JSON line of stdout.
  Missing binding/stub/exec failure → `SandboxUnavailableError` → falls back to the
  injected node adapter (AGENTS.md rule 4: never crash on missing config).

### Enabling the Cloudflare adapter

The binding is intentionally not provisioned in `terraform/` yet (`REHEARSAL_SANDBOX` is
`NOT_DEPLOYED` in scripts/verify-facts.ts). To turn it on:

1. Enable Containers access on the Cloudflare account.
2. Author the `Sandbox` Durable Object (the SDK's `examples/minimal` shape): a
   `DurableObject` whose `run(script)` starts `this.ctx.container` with the sandbox image,
   `Files(container).writeFile("/workspace/task.sh", script)`, then
   `container.exec(["sh","task.sh"], {cwd:"/workspace"})` → `{exitCode, stdout}`.
   Export it from the worker entry — with OpenNext that means a custom `main` that
   re-exports the built handler plus the DO.
3. In `wrangler.jsonc`: a `containers` entry naming the image, `durable_objects` binding
   `Sandbox` → class `Sandbox`, and `new_classes: ["Sandbox"]` under migrations.
4. Set `REHEARSAL_SANDBOX=cloudflare` (or leave `auto`) on the Worker.

## `runAgentTask` (src/lib/browser/agent.ts)

The verify stage's opt-in agent mode (`REHEARSAL_VERIFY_AGENT`). Where `runTrajectory`
replays scripted locators, `runAgentTask` runs the agent-browser loop through an
`AgentDriver`: `observe()` for the trajectory action's quoted label → keep the first
candidate whose method is click/scroll and whose element (`inspect`) is not a form control
(input/textarea/select/label, editable, or a submit button inside a form) → `act` on exactly
that selector with an instruction built from the trusted action → screenshot on the same
cadence → assertions via `probe()`/`evaluateAssertion`. The free-text goal never enters an
instruction, and a step with no safe candidate fails instead of free-form `act()`.
`BrowserRunner.supportsAgent` is true only when a model is configured
(`StagehandRunner.canAct`), so a runner without a model silently keeps `runTrajectory`.

On Browserbase, `observe`/`act`/`extract` run through Stagehand's remote transport, which
is also the path that works from the Workers deploy.

## Browserbase Function (`functions/rehearsal-browser`)

The Worker cannot run Stagehand v4 in-process (see above), so on workerd the browser
runner is `BrowserbaseFunctionRunner`: it `POST /v1/functions/{id}/invoke`s the published
Function and polls `GET /v1/functions/invocations/{id}` until `COMPLETED`/`FAILED`
(timeout 180 s, poll 2 s). The Function attaches `StagehandRunner` to the invocation's
session via `browserbase.connect` and returns `{ok, value | error, sessionId}`.

Publish/ops:
- `npm run functions:publish` — builds + uploads the bundle (self-contained project in
  `functions/rehearsal-browser/` with its own lockfile; `src/lib` is vendored in).
- The Stagehand extension is uploaded once
  (`browse cloud extensions upload stagehand-extension.zip`) and its id is pinned in
  `index.ts` (`BROWSERBASE_EXTENSION_ID` overrides).
- The `BROWSERBASE_API_KEY` project secret is attached to the Function with
  `browse functions secrets attach`.
- Worker env: `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` secrets,
  `BROWSERBASE_FUNCTION_ID` var (`wrangler.jsonc`). Without the id the Worker falls back
  to `UnavailableRunner`, which reports `BROWSER_UNAVAILABLE` per page.

Run errors are classified (`src/lib/errors.ts`) into `ErrorCode`s
(`contracts/errors.ts`): BROWSER_UNAVAILABLE, BROWSER_REMOTE_FAILED, NAV_TIMEOUT,
NAV_FAILED, HTTP_STATUS, NON_HTML, REDIRECT_OFF_ORIGIN, EGRESS_BLOCKED,
ROBOTS_DISALLOWED, BOT_CHALLENGE, DISCOVERY_EMPTY, UNKNOWN — persisted per page in
`Experiment.failures` and readable in `Experiment.errors` as `[CODE] message`.
