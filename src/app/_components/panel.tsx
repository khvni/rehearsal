import type { ReactNode } from "react";
import type { PanelState } from "@/lib/contracts";

export function Panel({
  title,
  meta,
  actions,
  state,
  busy,
  className,
  enter = "fade",
  emptyAction,
  children,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  state: PanelState;
  busy?: boolean;
  className?: string;
  enter?: "fade" | "none";
  emptyAction?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`panel ${className ?? ""}`} aria-busy={state.kind === "loading" || busy}>
      <header className="panel-head">
        <h2>{title}</h2>
        {meta && <span className="panel-meta">{meta}</span>}
        {busy && state.kind === "ready" && <span className="pill running">Updating</span>}
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {state.kind === "ready" && <div className={`panel-body ${enter === "fade" ? "reveal" : ""}`}>{children}</div>}
      {state.kind === "loading" && (
        <div className="state" role="status">
          <div className="skeleton" />
          <div className="skeleton short" />
          <p className="state-text">{state.label}</p>
        </div>
      )}
      {state.kind === "empty" && (
        <div className="state reveal">
          <p className="state-text">{state.message}</p>
          {emptyAction}
        </div>
      )}
      {state.kind === "error" && (
        <div className="state error reveal" role="alert">
          <p className="state-title">This step failed</p>
          <p className="state-text">{state.message}</p>
          {state.onRetry && (
            <button type="button" onClick={state.onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  );
}
