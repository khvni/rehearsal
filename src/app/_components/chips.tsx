"use client";

import type { Finding, KrugPrinciple } from "@/lib/contracts";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { KRUG_PRINCIPLES } from "./krug";

export const SEVERITY_ORDER: Finding["severity"][] = ["critical", "high", "medium", "low"];

const SEVERITY_COLOR = { critical: "red", high: "orange", medium: "amber", low: "gray" } as const;

export function SeverityChip({ severity }: { severity: Finding["severity"] }) {
  return (
    <Badge color={SEVERITY_COLOR[severity]} variant={severity === "critical" ? "solid" : "dot"} className="capitalize">
      {severity}
    </Badge>
  );
}

export function KrugChip({ principle }: { principle: KrugPrinciple }) {
  const p = KRUG_PRINCIPLES[principle];
  return (
    <Tooltip content={p.summary} side="top" contentClassName="max-w-[280px]">
      <span className="chip krug tip" tabIndex={0} aria-label={`${p.code} ${p.name}: ${p.summary}`}>
        {p.code}
      </span>
    </Tooltip>
  );
}
