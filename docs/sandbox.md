# Browser agent + code sandbox

How Rehearsal's agent executes browser flows and runs generated test code, and why the
pieces look the way they do.

## Research summary (what we evaluated)

- **Stagehand v4** (`@browserbasehq/stagehand` 4.4, already vendored) — exposes
  `observe(instruction)` → candidate elements `{selector, description, method}`,
  `act(instruction)` → self-healing action, `extract(instruction, schema)` → typed data.
  Runs on Browserbase remote sessions or local Chrome; the Browserbase transport is
  HTTP/WebSocket, so it works on workerd where Playwright itself cannot launch.
- **Vercel Labs `agent-browser`** — a Rust CLI daemon that drives Chrome over CDP one
  shell command at a time: `snapshot` returns the page as a compact accessibility tree
  with refs (`@e1`), the agent clicks a ref, snapshots again, repeats. It supports remote
  providers (Browserbase, Browserless) and `--cdp` attach. It is a *driving tool* for an
  agent harness, not an embeddable library — but its loop (snapshot → refs → act →
  re-snapshot) is the model `agent.ts` follows with Stagehand's observe/act/extract.
- **Cloudflare Sandbox SDK** (`@cloudflare/sandbox` 1.x) — `getSandbox(env.Sandbox, id)`
  returns a Durable Object stub that routes to an isolated Ubuntu container; `exec`,
  `runCode`, `createCodeContext`, file I/O, background processes. This is the only way to
  execute generated code from a Worker (workerd forbids `eval`/`new Function` and has no
  `node:worker_threads`). It needs a `containers` + Durable Object binding and Containers
  access on the account — see "Enabling the Cloudflare adapter" below.

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
  Resolves `env.Sandbox` via `getCloudflareContext({async:true})`, writes a self-contained
  harness into the container, runs `node harness.mjs`, parses the last JSON line.
  Missing binding/SDK/exec failure → `SandboxUnavailableError` → `selectSandbox` falls
  back to node (AGENTS.md rule 4: never crash on missing config).

### Enabling the Cloudflare adapter

The binding is intentionally not provisioned in `terraform/` yet (`REHEARSAL_SANDBOX` is
`NOT_DEPLOYED` in scripts/verify-facts.ts). To turn it on:

1. Enable Containers access on the Cloudflare account.
2. In `wrangler.jsonc`: add a `containers` entry pointing at the SDK image/Dockerfile and
   a Durable Object `Sandbox` binding (`new_classes: ["Sandbox"]`), and
   `export { Sandbox } from "@cloudflare/sandbox"` from the worker entry — per
   developers.cloudflare.com/sandbox-sdk.
3. Set `REHEARSAL_SANDBOX=cloudflare` (or leave `auto`) on the Worker.

## `runAgentTask` (src/lib/browser/agent.ts)

The verify stage's opt-in agent mode (`REHEARSAL_VERIFY_AGENT`). Where `runTrajectory`
replays scripted locators, `runAgentTask` runs the agent-browser loop through an
`AgentDriver`: `observe("the element for '<label>' — goal: <goal>")` → `act` on the best
candidate → screenshot on the same cadence → assertions via `probe()`/`evaluateAssertion`.
`BrowserRunner.supportsAgent` is true only when a model is configured
(`StagehandRunner.canAct`), so a runner without a model silently keeps `runTrajectory`.

On Browserbase, `observe`/`act`/`extract` run through Stagehand's remote transport, which
is also the path that works from the Workers deploy.
