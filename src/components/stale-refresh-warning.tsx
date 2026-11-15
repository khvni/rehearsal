"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StaleRefreshWarning({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="run-summary run-banner">
      <div className="flex items-start gap-3">
        <TriangleAlert size={20} strokeWidth={1.5} className="shrink-0 text-[var(--warning)]" aria-hidden="true" />
        <div className="flex min-w-0 flex-col items-start gap-2">
          <p className="font-medium">Couldn&apos;t refresh this experiment</p>
          <p className="card-body">Showing data from the last successful load. It may be out of date.</p>
          <Button variant="secondary" size="compact" onClick={onRetry}>Retry</Button>
        </div>
      </div>
    </div>
  );
}
