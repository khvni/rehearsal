"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon } from "../_components/icons";

interface MockupSummary {
  id: string;
  targetUrl: string;
  goal: string;
  createdAt: string;
  mockup: { llm: string; pages: { slug: string; title: string; source: "gemini" | "router" | "template" }[] };
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Every experiment that has a spec-stage mockup, linked straight into its preview. */
export default function MockupsPage() {
  const [experiments, setExperiments] = useState<MockupSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/experiments")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) =>
        setExperiments(
          (Array.isArray(data) ? data : []).filter(
            (e: MockupSummary) => e.mockup && e.mockup.pages.length > 0,
          ),
        ),
      )
      .catch(() => setExperiments([]));
  }, []);

  return (
    <div className="page">
      <nav className="topbar">
        <Link href="/" className="brand wordmark">
          Rehearsal
        </Link>
      </nav>
      <section className="panel past-experiments">
        <div className="panel-head">
          <h2>Mockups</h2>
          {experiments !== null && experiments.length > 0 && (
            <span className="panel-meta">{experiments.length}</span>
          )}
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
            <p className="card-meta">No mockups yet — they are built in the spec stage.</p>
          )}
          {(experiments ?? []).map((exp) => (
            <Link key={exp.id} href={`/experiments/${exp.id}/preview/`} className="card exp-row">
              <span className="card-title">
                <Badge variant="dot" color="blue">
                  {exp.mockup.llm}
                </Badge>
                <span className="card-heading">{exp.goal}</span>
                <ArrowIcon size={12} className="row-arrow" />
              </span>
              <span className="card-body">{exp.targetUrl}</span>
              <span className="card-meta">
                {exp.mockup.pages.length} page{exp.mockup.pages.length === 1 ? "" : "s"} · {shortDate(exp.createdAt)}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
