import type { ReactNode } from "react";

export type PanelState =
  | { kind: "ready" }
  | { kind: "loading"; label: string }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string; onRetry?: () => void };

export function Panel({
  title,
  meta,
  actions,
  state,
  busy,
  className,
  children,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  state: PanelState;
  busy?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`panel ${className ?? ""}`} aria-busy={state.kind === "loading" || busy}>
      <header className="panel-head">
        <h2>{title}</h2>
        {meta && <span className="panel-meta">{meta}</span>}
        {busy && state.kind === "ready" && <span className="pill running">updating</span>}
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {state.kind === "ready" && children}
      {state.kind === "loading" && (
        <div className="state">
          <div className="skeleton" />
          <div className="skeleton short" />
          <div className="skeleton" />
          <p className="state-text">{state.label}</p>
        </div>
      )}
      {state.kind === "empty" && (
        <div className="state">
          <p className="state-text">{state.message}</p>
        </div>
      )}
      {state.kind === "error" && (
        <div className="state error" role="alert">
          <p className="state-text">{state.message}</p>
          {state.onRetry && (
            <button type="button" onClick={state.onRetry}>
              Retry
            </button>
          )}
        </div>
      )}
    </section>
  );
}
