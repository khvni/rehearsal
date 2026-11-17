"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowIcon } from "./_components/icons";
import "./landing.css";

interface ExperimentSummary {
  id: string;
  targetUrl: string;
  goal: string;
  status: string;
  createdAt: string;
  exampleEligible?: boolean;
}

const GOALS = ["Find pricing and choose a plan", "Book a demo", "Complete a signup"];

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function siteName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function LayoutExample() {
  const [proposed, setProposed] = useState(false);
  return (
    <figure className="layout-example">
      <div className="example-toolbar">
        <span>Illustrative example · pricing page</span>
        <div className="example-switch" role="group" aria-label="Example layout">
          <button type="button" aria-pressed={!proposed} onClick={() => setProposed(false)}>Before</button>
          <button type="button" aria-pressed={proposed} onClick={() => setProposed(true)}>Wireframe proposal</button>
        </div>
      </div>
      <div className={`example-canvas ${proposed ? "is-proposed" : ""}`}>
        <div className="sample-page" aria-label={proposed ? "Proposed pricing layout" : "Original pricing layout"}>
          <div className="sample-nav"><strong>Acme</strong><span>Product&nbsp;&nbsp; Plans&nbsp;&nbsp; About</span></div>
          <div className="sample-content">
            <p className="sample-heading">{proposed ? "Choose your plan" : "Made for what’s next"}</p>
            <p className="sample-description">{proposed ? "Compare plans. Pick what fits your team." : "A new way to do your best work."}</p>
            <div className="sample-plans">
              <div><strong>Starter</strong><span>{proposed ? "$12 / month" : "For the everyday"}</span>{proposed && <span className="sample-cta">Choose Starter</span>}</div>
              <div><strong>Team</strong><span>{proposed ? "$29 / month" : "For the ambitious"}</span>{proposed && <span className="sample-cta">Choose Team</span>}</div>
            </div>
            {!proposed && <span className="sample-vague-cta">Let’s go <ArrowIcon size={14} /></span>}
          </div>
        </div>
        <div className="example-annotation" role="status">
          <span className="annotation-number">{proposed ? "02" : "01"}</span>
          <p>{proposed ? "Put price and next action where the decision happens." : "A visitor wants a price. The page asks them to guess."}</p>
        </div>
      </div>
      <figcaption>Explore layout and interaction, without getting distracted by a new visual design. This is an illustration, not a measured result.</figcaption>
    </figure>
  );
}

export default function Home() {
  const [experiments, setExperiments] = useState<ExperimentSummary[] | null>(null);
  const [experimentsLoadError, setExperimentsLoadError] = useState(false);
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const urlInput = useRef<HTMLInputElement>(null);
  const submitLock = useRef(false);
  const router = useRouter();

  const loadExperiments = useCallback(() => {
    return fetch("/api/experiments").then(async (response) => {
      if (!response.ok) throw new Error("Could not load rehearsals");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid rehearsal list");
      setExperiments(data);
      setExperimentsLoadError(false);
    }).catch(() => setExperimentsLoadError(true));
  }, []);

  useEffect(() => { void loadExperiments(); }, [loadExperiments]);
  const example = experiments?.find((experiment) => experiment.exampleEligible);
  const visibleExperiments = showAll ? experiments : experiments?.slice(0, 4);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current) return;
    setError("");
    setUrlError("");
    let targetUrl: URL;
    try {
      const value = url.trim();
      targetUrl = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
      if (!["http:", "https:"].includes(targetUrl.protocol) || !targetUrl.hostname.includes(".")) throw new Error("Invalid URL");
    } catch {
      setUrlError("Enter a public website address, like example.com.");
      urlInput.current?.focus();
      return;
    }
    setUrl(targetUrl.href);
    submitLock.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUrl: targetUrl.href, goal: goal.trim() || undefined }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (response.ok && data.id) {
        router.push(`/experiments/${data.id}`);
        return;
      }
      setError(response.status === 429
        ? "This shared demo has reached its daily limit. Try again tomorrow, or explore a recent rehearsal below."
        : data.error ?? "Could not start your rehearsal. Your details are saved here; please try again.");
    } catch {
      setError("Could not connect. Check your connection and try again; your details are still here.");
    }
    submitLock.current = false;
    setBusy(false);
  }

  return (
    <div className="landing">
      <a className="landing-skip" href="#start">Skip to start a rehearsal</a>
      <div className="landing-wrap">
        <header className="landing-header">
          <Link className="landing-brand" href="/" aria-label="Rehearsal home"><span className="brand-mark" aria-hidden="true"><span /><span /></span>Rehearsal</Link>
          <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#recent">Recent rehearsals</a></nav>
        </header>
        <main id="main-content">
          <section className="landing-intro" aria-labelledby="landing-title">
            <div className="intro-heading">
              <h1 id="landing-title">A clearer path.<br /><span>Before you ship.</span></h1>
              <div className="intro-copy">
                <p>Find where visitors get stuck on your website.</p>
                <p>Get usability findings and a fix plan, then explore a wireframe proposal. Start with a public page and a visitor&rsquo;s goal.</p>
                <a href={example ? `/experiments/${example.id}` : "#how-it-works"}>{example ? "Explore an example run" : "See how it works"}<ArrowIcon size={16} /></a>
              </div>
            </div>
            <form id="start" className="rehearsal-form" onSubmit={start} aria-busy={busy} aria-labelledby="start-title" noValidate>
              <div className="form-heading"><h2 id="start-title">Start a rehearsal</h2><span>01 / Give us a task</span></div>
              <fieldset disabled={busy}>
                <legend className="sr-only">Website and visitor goal</legend>
                <div className="form-fields">
                  <div className="landing-field">
                    <label htmlFor="target-url">Your page URL</label>
                    <Input ref={urlInput} id="target-url" name="targetUrl" type="text" inputMode="url" autoComplete="url" spellCheck={false} required placeholder="yourwebsite.com" value={url} onChange={(event) => { setUrl(event.target.value); setUrlError(""); }} aria-invalid={Boolean(urlError)} aria-describedby={urlError ? "url-error url-help" : "url-help"} />
                    <p id="url-help" className="field-help">A public page. No login required to view it.</p>
                    {urlError && <p id="url-error" className="landing-error" role="alert">{urlError}</p>}
                  </div>
                  <div className="landing-field">
                    <label htmlFor="goal">What should a visitor do? <span>(optional)</span></label>
                    <Textarea id="goal" name="goal" rows={1} maxLength={500} placeholder="e.g. Find the right plan and sign up" value={goal} onChange={(event) => setGoal(event.target.value)} aria-describedby="goal-help" />
                    <p id="goal-help" className="field-help">Leave blank and we&rsquo;ll infer a goal from the page.</p>
                    <div className="goal-examples" aria-label="Visitor goal examples">
                      {GOALS.map((suggestion) => <button key={suggestion} type="button" aria-pressed={goal === suggestion} onClick={() => setGoal(suggestion)}>{suggestion}<ArrowIcon size={12} /></button>)}
                    </div>
                  </div>
                </div>
                {error && <p className="landing-error submit-error" role="alert">{error}</p>}
                <div className="form-footer">
                  <p>Your live site stays untouched.<br /><span>Runs in this shared demo are public. Results can take a few minutes.</span></p>
                  <button type="submit" className="landing-submit" disabled={busy}>{busy ? "Starting rehearsal…" : "Start rehearsal"}<ArrowIcon size={20} /></button>
                </div>
              </fieldset>
            </form>
          </section>
          <section id="how-it-works" className="landing-method" aria-labelledby="method-title">
            <div className="method-heading"><h2 id="method-title">From &ldquo;something feels off&rdquo;<br />to a fix you can explain.</h2><p>We focus on what people need to do,<br className="desktop-break" /> and what gets in their way.</p></div>
            <div className="method-body">
              <ol className="method-steps">
                <li><span>01</span><div><h3>Rehearse a real task</h3><p>We map the public pages and simulate journeys toward your visitor&rsquo;s goal.</p></div></li>
                <li><span>02</span><div><h3>See what needs attention</h3><p>Review ranked findings and a fix plan. Browser evidence, when available, is kept separate from hypotheses.</p></div></li>
                <li><span>03</span><div><h3>Explore a clearer layout</h3><p>Build a wireframe proposal from the findings. Compare structure, copy, and interactions before committing to a visual design.</p></div></li>
              </ol>
              <LayoutExample />
            </div>
            <aside className="evidence-note"><strong>A useful starting point for UX decisions.</strong><p>Simulated visitors aren&rsquo;t your customers. Findings are labeled by evidence strength; use them to guide changes and real usability tests, not to predict conversion.</p></aside>
          </section>
          <section id="recent" className="landing-recent" aria-labelledby="recent-title">
            <div className="recent-heading"><div><h2 id="recent-title">Recent rehearsals</h2><p>Public runs from this shared workspace. Open one to explore the results.</p></div><Link href="/mockups">Browse mockups<ArrowIcon size={16} /></Link></div>
            {experimentsLoadError ? <div className="recent-state" role="alert"><p>Could not load recent rehearsals.</p><button type="button" onClick={() => void loadExperiments()}>Try again<ArrowIcon size={16} /></button></div>
              : experiments === null ? <p className="recent-state" role="status">Loading recent rehearsals…</p>
                : experiments.length === 0 ? <p className="recent-state">No rehearsals yet. Add your page above to start the first one.</p>
                  : <ul className="recent-list">{visibleExperiments?.map((experiment) => <li key={experiment.id}><Link href={`/experiments/${experiment.id}`}><span className="recent-site">{siteName(experiment.targetUrl)}</span><span className="recent-goal">{experiment.goal || "Inferred visitor goal"}</span><span className="recent-status">{experiment.status.replace(/-/g, " ")}</span><time dateTime={experiment.createdAt}>{shortDate(experiment.createdAt)}</time><ArrowIcon size={16} /></Link></li>)}</ul>}
            {!experimentsLoadError && experiments && experiments.length > 4 && <button className="show-rehearsals" type="button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer rehearsals" : `Show all ${experiments.length} rehearsals`}<ArrowIcon size={16} /></button>}
          </section>
        </main>
        <footer className="landing-footer"><Link href="/" className="landing-brand">Rehearsal</Link><p>Better journeys start with better questions.</p><a href="#start">Rehearse your site<ArrowIcon size={16} /></a></footer>
      </div>
    </div>
  );
}
