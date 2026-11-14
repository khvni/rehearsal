import type { ReactNode } from "react";
import type { PanelState } from "@/lib/contracts";
import { Banner, BannerAction, BannerActions, BannerDescription, BannerTitle } from "@/components/ui/banner";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";

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
          <ThinkingIndicator words={[state.label]} />
        </div>
      )}
      {state.kind === "empty" && (
        <div className="state reveal">
          <p className="state-text">{state.message}</p>
          {emptyAction}
        </div>
      )}
      {state.kind === "error" && (
        <div className="state reveal">
          <Banner status="error" className="panel-error">
            <BannerTitle>This step failed</BannerTitle>
            <BannerDescription>{state.message}</BannerDescription>
            {state.onRetry && (
              <BannerActions>
                <BannerAction onClick={state.onRetry}>Try again</BannerAction>
              </BannerActions>
            )}
          </Banner>
        </div>
      )}
    </section>
  );
}
