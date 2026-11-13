"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [url, setUrl] = useState("https://ai.engineer/code/2026");
  const [goal, setGoal] = useState("Determine whether someone can still register for the conference");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUrl: url, goal }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (data.id) router.push(`/experiments/${data.id}`);
      else alert(data.error ?? "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Rehearsal</h1>
        <span className="meta">Simulate journeys. Verify in real browsers. Ship a rebuild spec.</span>
      </div>
      <form className="form" onSubmit={start}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Target URL" />
        <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should a visitor accomplish?" aria-label="Objective" />
        <button type="submit" disabled={busy}>{busy ? "Creating…" : "Rehearse"}</button>
      </form>
      <div className="panel">
        <h3>How it works</h3>
        <p className="step">1. Discover states → build a decision graph (Playwright + Bright Data)</p>
        <p className="step">2. Jev System One scores actions → 1000 seeded simulated journeys</p>
        <p className="step">3. Riskiest paths verified in real desktop + mobile browsers</p>
        <p className="step">4. Findings graded on Krug&apos;s rubric → variant applied → re-verified</p>
        <p className="step">5. Output: spec.md — every fix + a rebuild plan</p>
      </div>
    </div>
  );
}
