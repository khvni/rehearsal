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
      <nav className="topbar">
        <span className="brand">
          <span className="brand-mark" aria-hidden />
          Rehearsal
        </span>
      </nav>
      <header className="hero">
        <h1>Find where visitors get stuck</h1>
        <p className="lede">Give Rehearsal a page and a goal. It walks the site, replays the risky paths in real browsers, and writes up what to fix.</p>
      </header>
      <form className="launch" onSubmit={start} aria-busy={busy}>
        <label className="field">
          <span className="field-label">Page URL</span>
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
          <span className="field-hint">One task, in plain words. For example: find the price, or sign up.</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" className="primary" disabled={busy || !url.trim() || !goal.trim()}>
            {busy ? "Starting…" : "Start rehearsal"}
          </button>
        </div>
      </form>
      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">What happens next</h2>
        <ol>
          {STEPS.map(([name, desc], i) => (
            <li key={name}>
              <span className="n">{i + 1}</span>
              <span className="name">{name}</span>
              <span className="desc">{desc}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const STEPS: [string, string][] = [
  ["Discover", "Visit the page and map every state a visitor can reach."],
  ["Simulate", "Run 1,000 seeded journeys toward your goal and count where they end up."],
  ["Verify", "Replay the riskiest journeys in real desktop and mobile browsers."],
  ["Analyze", "Grade each problem against Krug’s usability rules, with the evidence attached."],
  ["Compare", "Patch the top problem, run it again, and check whether the fix holds."],
  ["Spec", "Write spec.md: every fix, ranked, plus a rebuild plan."],
];
