"use client";

import { USABILITY_PRINCIPLES, type Finding, type UsabilityPrinciple } from "@/lib/contracts";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";

export const SEVERITY_ORDER: Finding["severity"][] = ["critical", "high", "medium", "low"];

const SEVERITY_COLOR = { critical: "red", high: "orange", medium: "amber", low: "gray" } as const;

export function SeverityChip({ severity }: { severity: Finding["severity"] }) {
  return (
    <Badge color={SEVERITY_COLOR[severity]} variant={severity === "critical" ? "solid" : "dot"} className="capitalize">
      {severity}
    </Badge>
  );
}

export function PrincipleChip({ principle }: { principle: UsabilityPrinciple }) {
  const p = USABILITY_PRINCIPLES[principle];
  return (
    <Tooltip content={p.summary} side="top" contentClassName="max-w-[280px]">
      <span className="chip principle tip" tabIndex={0} aria-label={`${p.title}: ${p.summary}`}>
        {p.title}
      </span>
    </Tooltip>
  );
}
