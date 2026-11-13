"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
    </main>
  );
}
