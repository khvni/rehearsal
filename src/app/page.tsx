"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="page narrow">
      <div className="header">
        <h1>Rehearsal</h1>
        <span className="meta">Simulate journeys. Verify in real browsers. Ship a rebuild spec.</span>
      </div>
      <form className="launch" onSubmit={start} aria-busy={busy}>
        <label className="field">
          <span className="field-label">Site URL</span>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            autoComplete="url"
            inputMode="url"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
          />
        </label>
        <label className="field">
          <span className="field-label">Goal</span>
          <textarea
            required
            rows={2}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What should a visitor be able to do?"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" className="primary" disabled={busy || !url.trim() || !goal.trim()}>
            {busy ? "Creating…" : "Rehearse"}
          </button>
        </div>
      </form>
      <section className="panel">
        <header className="panel-head">
          <h2>How it works</h2>
        </header>
        <ol className="how">
          <li>Discover states and build a decision graph (Playwright + Bright Data)</li>
          <li>Jev System One scores actions; 1000 seeded simulated journeys</li>
          <li>Riskiest paths verified in real desktop and mobile browsers</li>
          <li>Findings graded on Krug&apos;s rubric; a variant is applied and re-verified</li>
          <li>Output: spec.md with every fix and a rebuild plan</li>
        </ol>
      </section>
    </div>
  );
}
