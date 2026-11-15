"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowIcon } from "./_components/icons";

interface ExperimentSummary {
  id: string;
  targetUrl: string;
  goal: string;
  status: string;
  createdAt: string;
  exampleEligible?: boolean;
}

const RUNNING = ["queued", "discovering", "simulating", "verifying", "analyzing", "comparing"];

function statusColor(status: string): "green" | "red" | "blue" | "gray" {
  if (status === "complete") return "green";
  if (status === "failed") return "red";
  if (RUNNING.includes(status)) return "blue";
  return "gray";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PastExperiments({ experiments }: { experiments: ExperimentSummary[] | null }) {
  return (
    <section className="panel past-experiments">
      <div className="panel-head">
        <h2>Past experiments</h2>
        {experiments !== null && experiments.length > 0 && (
          <span className="panel-meta">{experiments.length}</span>
        )}
        <div className="panel-actions">
          <Link href="/mockups" className="button-link">
            Mockups
            <ArrowIcon size={12} />
          </Link>
        </div>
      </div>
      <div className="panel-body">
        {experiments === null && (
          <div className="skel-rows" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skel-row">
                <span className="skeleton" />
                <span className="skeleton short" />
              </div>
            ))}
          </div>
        )}
        {experiments !== null && experiments.length === 0 && (
          <p className="card-meta">No experiments yet — run your first rehearsal above.</p>
        )}
        {(experiments ?? []).map((exp) => (
          <Link key={exp.id} href={`/experiments/${exp.id}`} className="card exp-row">
            <span className="card-title">
              <Badge variant="dot" color={statusColor(exp.status)}>
                {exp.status}
              </Badge>
              <span className="card-heading">{exp.goal}</span>
              <ArrowIcon size={12} className="row-arrow" />
            </span>
            <span className="card-body">{exp.targetUrl}</span>
            <span className="card-meta">{shortDate(exp.createdAt)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [experiments, setExperiments] = useState<ExperimentSummary[] | null>(null);
  const [url, setUrl] = useState("https://ai.engineer/code/2026");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/experiments")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setExperiments(Array.isArray(data) ? data : []))
      .catch(() => setExperiments([]));
  }, []);
  const example = experiments?.find((e) => e.exampleEligible);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUrl: url.trim(), goal: goal.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok && data.id) {
        router.push(`/experiments/${data.id}`);
        return;
      }
      setError(data.error ?? `Request failed (${res.status})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  return (
    <main className="page narrow home reveal-product">
      <header className="hero">
        <h1 className="wordmark">Rehearsal</h1>
        <p className="tagline">Simulated visitors test your site and suggest fixes.</p>
        <p className="hero-description">Give us a public page and a visitor goal. Get ranked usability findings, browser evidence when available, and a fix plan.</p>
        {example && <Link className="example-link" href={`/experiments/${example.id}`}>See an example run <ArrowIcon size={14} /></Link>}
      </header>
      <form className="launch" onSubmit={start} aria-busy={busy}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="target-url">Page URL</FieldLabel>
            <Input
              id="target-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="goal">Goal <span className="muted">(optional)</span></FieldLabel>
            <Textarea id="goal" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} />
            <FieldDescription>What should a visitor be able to do here? Leave blank and Rehearsal infers it from the site&rsquo;s own CTAs and links.</FieldDescription>
          </Field>
          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>
        <Button type="submit" className="launch-submit" trailingIcon={ArrowIcon} loading={busy} disabled={busy || !url.trim()}>
          {busy ? "Starting…" : "Start rehearsal"}
        </Button>
      </form>
      <PastExperiments experiments={experiments} />
    </main>
  );
}
