import { randomUUID } from "node:crypto";
import {
  ActionNode,
  SiteState,
  StateGraph,
  Viewport,
} from "../contracts";
import { stateHashFor } from "../browser/extract";

/** Build a SiteState from extracted page data with deterministic dedup hash. */
export function makeState(args: {
  url: string;
  viewport: Viewport;
  title: string;
  visibleText: string;
  actions: Omit<ActionNode, "actionId" | "stateId">[];
  screenshotPath?: string;
  modalOpen?: boolean;
}): SiteState {
  const stateId = `st_${randomUUID().slice(0, 8)}`;
  const actions: ActionNode[] = args.actions.map((a, i) => ({
    ...a,
    actionId: `${stateId}_a${i}`,
    stateId,
  }));
  return {
    stateId,
    url: args.url,
    viewport: args.viewport,
    pageTitle: args.title,
    visibleText: args.visibleText,
    actions,
    screenshotPath: args.screenshotPath,
    stateHash: stateHashFor(args.url, args.viewport.name, actions, args.modalOpen ?? false),
    metadata: args.modalOpen !== undefined ? { modalOpen: args.modalOpen } : undefined,
  };
}

export class GraphBuilder {
  private states = new Map<string, SiteState>(); // keyed by stateHash
  private edges: { fromStateId: string; actionId: string; toStateId: string }[] = [];

  constructor(
    private maxStates = 30,
    private maxDepth = 3,
  ) {}

  /** Add a state; returns the canonical state (deduped by hash) and whether it was new. */
  add(state: SiteState): { state: SiteState; isNew: boolean } {
    const existing = this.states.get(state.stateHash);
    if (existing) return { state: existing, isNew: false };
    if (this.states.size >= this.maxStates) return { state, isNew: false };
    this.states.set(state.stateHash, state);
    return { state, isNew: true };
  }

  link(fromStateId: string, actionId: string, toStateId: string): void {
    if (
      !this.edges.some(
        (e) => e.fromStateId === fromStateId && e.actionId === actionId && e.toStateId === toStateId,
      )
    ) {
      this.edges.push({ fromStateId, actionId, toStateId });
    }
  }

  build(): StateGraph {
    return { states: [...this.states.values()], edges: this.edges };
  }

  get full(): boolean {
    return this.states.size >= this.maxStates;
  }

  has(stateId: string): boolean {
    return [...this.states.values()].some((s) => s.stateId === stateId);
  }

  get depthLimit(): number {
    return this.maxDepth;
  }
}

/** BFS adjacency: stateId -> [{action, toStateId}] using known destinations. */
export function adjacency(graph: StateGraph): Map<string, { action: ActionNode; toStateId?: string }[]> {
  const states = new Map(graph.states.map((s) => [s.stateId, s]));
  const out = new Map<string, { action: ActionNode; toStateId?: string }[]>();
  for (const s of graph.states) {
    const entries = s.actions
      .filter((a) => a.enabled && a.safeToExecute)
      .map((action) => {
        const edge = graph.edges.find(
          (e) => e.fromStateId === s.stateId && e.actionId === action.actionId,
        );
        return { action, toStateId: edge?.toStateId };
      });
    out.set(s.stateId, entries);
  }
  void states;
  return out;
}
