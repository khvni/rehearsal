"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Experiment, PanelState } from "@/lib/contracts";
import { Panel } from "../../../_components/panel";
import { Badge } from "@/components/ui/badge";
import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardGroup } from "@/components/ui/card";
import { StaleRefreshWarning } from "@/components/stale-refresh-warning";

const SOURCE_LABEL: Record<string, string> = {
  "experiment-goal": "Your goal",
  cta: "CTA",
  nav: "Nav",
  endpoint: "Endpoint",
  title: "Page title",
  implied: "Implied",
};

const SWATCH_STYLE = {
  display: "inline-block",
  width: 14,
  height: 14,
  borderRadius: 4,
  boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.1)",
  flex: "none",
} as const;

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

type Loaded = { exp?: Experiment; error?: string };

async function loadExperiment(id: string): Promise<Loaded> {
  try {
    const res = await fetch(`/api/experiments/${id}`, { cache: "no-store" });
    if (!res.ok) return { error: await readError(res) };
    return { exp: (await res.json()) as Experiment };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function sameOriginUrl(
  candidate: string | undefined,
  base: string
): string | undefined {
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate, base);
    return url.origin === new URL(base).origin ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function TopBar({ id }: { id: string }) {
  return (
    <nav className="topbar">
      <Link href="/" className="brand wordmark">
        Rehearsal
      </Link>
      <Link href={`/experiments/${id}`} className="new-link">
        Back to experiment
      </Link>
    </nav>
  );
}

export default function RebuildPage() {
  const { id } = useParams<{ id: string }>();
  const [exp, setExp] = useState<Experiment | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState(false);
  const [runError, setRunError] = useState("");
  const [waitingForSlot, setWaitingForSlot] = useState(false);

  const apply = useCallback((loaded: Loaded) => {
    if (loaded.exp) setExp(loaded.exp);
    setLoadError(loaded.error ?? "");
  }, []);

  const refresh = useCallback(
    async () => apply(await loadExperiment(id)),
    [id, apply]
  );

  useEffect(() => {
    let cancelled = false;
    void loadExperiment(id).then((loaded) => {
      if (!cancelled) apply(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [id, apply]);

  const polling = exp?.status === "rebuilding" && !pending;
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [polling, refresh]);

  async function runRebuild() {
    setPending(true);
    setRunError("");
    try {
      let restart =
        !!exp?.rebuild &&
        !exp.rebuild.site?.pages.some((p) => p.status === "planned") &&
        !!exp.rebuild.site?.completedAt;
      if (exp?.rebuild && !exp.rebuild.site) restart = true;
      let more = true;
      let busyRetries = 0;
      let waitedMs = 0;
      while (more) {
        const res = await fetch(
          `/api/experiments/${id}/rebuild${restart ? "?restart=1" : ""}`,
          { method: "POST" }
        );
        if (!res.ok) {
          const error = await readError(res);
          if (res.status === 429 && error.startsWith("busy:") && busyRetries < 4) {
            const retryAfter = Number(res.headers.get("retry-after") ?? "30");
            const delay = Number.isFinite(retryAfter) ? Math.max(1000, retryAfter * 1000) : 30_000;
            if (waitedMs + delay <= 120_000) {
              busyRetries++;
              waitedMs += delay;
              setWaitingForSlot(true);
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
          }
          throw new Error(error);
        }
        setWaitingForSlot(false);
        const next = (await res.json()) as Experiment;
        setExp(next);
        more = !!next.rebuild?.site && !next.rebuild.site.completedAt;
        restart = false;
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setWaitingForSlot(false);
      setPending(false);
      await refresh();
    }
  }

  if (loadError && !exp) {
    return (
      <div className="page">
        <TopBar id={id} />
        <div className="state error page-state" role="alert">
          <p className="state-title">Couldn&apos;t load this experiment</p>
          <p className="state-text">{loadError}</p>
          <div className="row">
            <button type="button" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!exp) {
    return (
      <div className="page">
        <TopBar id={id} />
        <div className="state page-state" role="status" aria-busy>
          <div className="skeleton" />
          <div className="skeleton short" />
          <p className="state-text">Loading rebuild…</p>
        </div>
      </div>
    );
  }

  const rebuild = exp.rebuild;
  const templatePlan = rebuild?.site?.plannerSource === "template";
  const statusColor =
    exp.status === "failed"
      ? "red"
      : exp.status === "complete"
        ? "green"
        : exp.status === "created"
          ? "gray"
          : "blue";
  const rebuildState: PanelState = rebuild
    ? { kind: "ready" }
    : pending
      ? { kind: "loading", label: "Rebuilding the site…" }
      : runError
        ? { kind: "error", message: runError, onRetry: () => void runRebuild() }
        : {
            kind: "empty",
            message:
              "Build a self-contained site from every crawled page, using one shared design system. Rebuild only runs when you ask.",
          };
  const runButton = (
    <Button
      variant="secondary"
      size="compact"
      loading={pending}
      disabled={pending}
      onClick={() => void runRebuild()}
    >
      {rebuild?.site && !rebuild.site.completedAt
        ? "Continue build"
        : rebuild
          ? "Rebuild again"
          : "Build site"}
    </Button>
  );

  const brand = rebuild?.brand;
  const logo = sameOriginUrl(brand?.logoUrl, exp.targetUrl);
  const favicon = sameOriginUrl(brand?.faviconUrl, exp.targetUrl);
  const swatches = brand
    ? (Object.entries(brand.colors).filter(([, v]) => Boolean(v)) as [
        string,
        string,
      ][])
    : [];

  return (
    <div className="page">
      <TopBar id={id} />
      {loadError && <StaleRefreshWarning onRetry={() => void refresh()} />}
      {waitingForSlot && <p role="status">Waiting for a free build slot…</p>}
      <header className="exp-head">
        <h1>{exp.goal}</h1>
        <div className="exp-meta">
          <Badge variant="dot" color={statusColor}>
            {exp.status}
          </Badge>
          <a
            className="mono"
            href={exp.targetUrl}
            target="_blank"
            rel="noreferrer"
          >
            {exp.targetUrl}
          </a>
          {rebuild && (
            <span className="tabular">
              {rebuild.llm} · {new Date(rebuild.generatedAt).toLocaleString()}
            </span>
          )}
        </div>
      </header>

      {!rebuild ? (
        <div className="grid">
          <Panel
            title="Rebuild"
            className="span-2"
            state={rebuildState}
            emptyAction={runButton}
          />
        </div>
      ) : (
        <div className="grid">
          {(runError || templatePlan || rebuild.llmError) && (
            <div className="span-2">
              <Banner
                status={runError ? "error" : "warning"}
                role={runError ? "alert" : "status"}
              >
                <BannerTitle>
                  {runError
                    ? "Rebuild didn't run"
                    : templatePlan
                      ? "Site plan uses a template"
                      : `${rebuild.llm} copy unavailable — pages use templates`}
                </BannerTitle>
                <BannerDescription>
                  {runError ||
                    (templatePlan
                      ? rebuild.site?.plannerError ||
                        "The AI planner did not produce a usable site plan. The build uses a deterministic plan from the captured pages."
                      : rebuild.llmError)}
                </BannerDescription>
              </Banner>
            </div>
          )}
          {rebuild.site && (
            <Panel
              title="Rebuilt site"
              className="span-2"
              state={{ kind: "ready" }}
              actions={runButton}
              meta={
                <span className="tabular" role="status" aria-live="polite">
                  Built{" "}
                  {
                    rebuild.site.pages.filter((p) => p.status === "built")
                      .length
                  }{" "}
                  of {rebuild.site.pages.length} pages
                  {rebuild.site.gap && (
                    <> · Gap round {rebuild.site.gap.round} of 4: checked {rebuild.site.gap.cursor} of {rebuild.site.gap.candidates.length}
                      {rebuild.site.gap.failed.length > 0 && `; ${rebuild.site.gap.failed.length} failed`}
                      {rebuild.site.gap.skipped > 0 && `; ${rebuild.site.gap.skipped} over cap`}
                    </>
                  )}
                </span>
              }
            >
              <div className="card">
                <p className="card-body">
                  One design system, connected navigation, and a page for every
                  crawled path.
                </p>
                <a
                  className="card-heading"
                  href={`/experiments/${id}/rb/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open rebuilt site
                </a>
                {runError && <p role="alert">{runError}</p>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Rebuilt sitemap</caption>
                  <thead>
                    <tr>
                      <th className="p-3">Path / title</th>
                      <th className="p-3">Mode</th>
                      <th className="p-3">Source / status</th>
                      <th className="p-3">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rebuild.site.pages.map((page) => (
                      <tr key={page.path} className="border-t">
                        <td className="p-3">
                          <a
                            href={`/experiments/${id}/rb${page.path === "/" ? "/" : page.path}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {page.path}
                          </a>
                          <p className="card-meta">{page.title}</p>
                        </td>
                        <td className="p-3">{page.mode}</td>
                        <td className="p-3">
                          {page.source ?? "—"}
                          <p className="card-meta">{page.status}</p>
                        </td>
                        <td className="p-3">
                          {page.issues?.join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          {rebuild.pages.length > 0 && (
            <Panel
              title="Legacy goal pages"
              className="span-2"
              meta={<span className="tabular">{rebuild.pages.length}</span>}
              state={rebuildState}
              actions={runButton}
            >
              <CardGroup className="list stagger" fluidHover={false}>
                {rebuild.pages.map((p, idx) => (
                  <Card key={p.slug} index={idx}>
                    <CardContent className="card">
                      <div className="card-title">
                        <a
                          className="card-heading"
                          href={`/experiments/${id}/rebuild/${p.slug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {p.title}
                        </a>
                        <Badge
                          variant="dot"
                          color={p.source !== "template" ? "blue" : "gray"}
                        >
                          {p.source}
                        </Badge>
                      </div>
                      <p className="card-body">{p.summary}</p>
                      <span className="card-meta tabular">
                        {p.goal} · {(p.bytes / 1024).toFixed(1)} KB
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </CardGroup>
            </Panel>
          )}

          <Panel title="Brand" meta={brand?.tone} state={{ kind: "ready" }}>
            {brand && (
              <div className="card">
                <div className="card-title">
                  {(logo || favicon) && (
                    // eslint-disable-next-line @next/next/no-img-element -- same-origin asset on the audited site
                    <img
                      src={logo ?? favicon}
                      alt={brand.logoAlt ?? ""}
                      height={20}
                      style={{ height: 20, width: "auto" }}
                    />
                  )}
                  <p className="card-heading">{brand.name}</p>
                </div>
                <div className="chips">
                  {swatches.map(([key, value]) => (
                    <span key={key} className="chip" title={value}>
                      <span
                        aria-hidden
                        style={{ ...SWATCH_STYLE, background: value }}
                      />
                      {key} <span className="mono">{value}</span>
                    </span>
                  ))}
                </div>
                <p className="card-meta">
                  <span className="mono">{brand.fonts.sans}</span>
                  {brand.fonts.mono && (
                    <>
                      {" "}
                      · <span className="mono">{brand.fonts.mono}</span>
                    </>
                  )}
                </p>
                {brand.voiceNotes.length > 0 && (
                  <p className="card-body">{brand.voiceNotes.join(" ")}</p>
                )}
              </div>
            )}
          </Panel>

          <Panel
            title="Goals"
            meta={<span className="tabular">{rebuild.goals.length}</span>}
            state={{ kind: "ready" }}
          >
            <CardGroup className="list" fluidHover={false}>
              {rebuild.goals.map((g, idx) => (
                <Card key={g.goalId} index={idx}>
                  <CardContent className="card">
                    <div className="card-title">
                      <p className="card-heading">{g.title}</p>
                      <Badge
                        variant="dot"
                        color={
                          g.source === "experiment-goal" ? "accent" : "gray"
                        }
                      >
                        {SOURCE_LABEL[g.source] ?? g.source}
                      </Badge>
                      <span className="card-meta tabular">
                        {g.weight.toFixed(2)}
                      </span>
                    </div>
                    {g.targetUrl && (
                      <a
                        className="mono card-meta"
                        href={g.targetUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {g.targetUrl}
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
            </CardGroup>
          </Panel>
        </div>
      )}
    </div>
  );
}
