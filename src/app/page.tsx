"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ExperimentSummary {
  id: string;
  targetUrl: string;
  goal: string;
  status: string;
  createdAt: string;
}

function PastExperiments() {
  const [experiments, setExperiments] = useState<ExperimentSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/experiments")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setExperiments(Array.isArray(data) ? data : []))
      .catch(() => setExperiments([]));
  }, []);

  return (
    <section className="panel past-experiments">
      <div className="panel-head">
        <h2>Past experiments</h2>
        <span className="panel-meta">{experiments === null ? "Loading…" : `${experiments.length}`}</span>
        <div className="panel-actions">
          <Link href="/mockups" className="new-link">Mockups →</Link>
        </div>
      </div>
      <div className="panel-body">
        {experiments !== null && experiments.length === 0 && (
          <p className="card-meta">No experiments yet — run your first rehearsal above.</p>
        )}
        {(experiments ?? []).map((exp) => (
          <Link key={exp.id} href={`/experiments/${exp.id}`} className="card exp-row">
            <span className="card-title">
              <span className="card-heading">{exp.goal}</span>
            </span>
            <span className="card-body">{exp.targetUrl}</span>
            <span className="card-meta">{exp.status} · {new Date(exp.createdAt).toLocaleDateString()}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [url, setUrl] = useState("https://ai.engineer/code/2026");
  const [goal, setGoal] = useState("Determine whether someone can still register for the conference");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUrl: url.trim(), goal: goal.trim() }),
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
        <p className="tagline">Why leave your website to chance?</p>
      </header>
      <form className="launch" onSubmit={start} aria-busy={busy}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="target-url">Page URL</FieldLabel>
            <Input id="target-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="goal">Goal</FieldLabel>
            <Textarea id="goal" required rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </Field>
          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>
        <Button type="submit" className="launch-submit" loading={busy} disabled={busy || !url.trim() || !goal.trim()}>
          {busy ? "Starting…" : "Start rehearsal"}
        </Button>
      </form>
      <PastExperiments />
    </main>
  );
}
