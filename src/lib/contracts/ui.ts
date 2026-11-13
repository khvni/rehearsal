// Dashboard view state shared across src/app components.

/** Loading/empty/error state rendered by <Panel>. */
export type PanelState =
  | { kind: "ready" }
  | { kind: "loading"; label: string }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string; onRetry?: () => void };
