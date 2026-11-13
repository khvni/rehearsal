"use client";

import { useId, useState } from "react";
import type { Finding, KrugPrinciple } from "@/lib/contracts";
import { KRUG_PRINCIPLES } from "./krug";

export const SEVERITY_ORDER: Finding["severity"][] = ["critical", "high", "medium", "low"];

export function SeverityChip({ severity }: { severity: Finding["severity"] }) {
  return <span className={`chip sev-${severity}`}>{severity}</span>;
}

export function KrugChip({ principle }: { principle: KrugPrinciple }) {
  const id = useId();
  const p = KRUG_PRINCIPLES[principle];
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  function show(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const above = r.bottom + 80 > window.innerHeight;
    setPos({ left: Math.min(r.left, window.innerWidth - 300), top: above ? r.top - 6 : r.bottom + 6, above });
  }

  return (
    <span
      className="tip"
      tabIndex={0}
      aria-describedby={id}
      onMouseEnter={(e) => show(e.currentTarget)}
      onFocus={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      onBlur={() => setPos(null)}
    >
      <span className="chip krug">
        <span className="krug-code">{p.code}</span>
        {p.name}
      </span>
      <span
        role="tooltip"
        id={id}
        className={`tip-body ${pos ? "open" : ""} ${pos?.above ? "above" : ""}`}
        style={pos ? { left: pos.left, top: pos.top } : undefined}
      >
        {p.summary}
      </span>
    </span>
  );
}
