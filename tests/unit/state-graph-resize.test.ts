import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StateGraph } from "@/app/experiments/[id]/state-graph";

const fitView = vi.fn();
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ onInit, children }: { onInit: (instance: unknown) => void; children: ReactNode }) => {
    React.useEffect(() => onInit({ fitView }), [onInit]);
    return React.createElement("div", null, children);
  },
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: "dots" },
  PanOnScrollMode: { Free: "free" },
  MarkerType: { ArrowClosed: "arrowclosed" },
}));

let root: Root;
let resize: (entries: { contentRect: { width: number; height: number } }[]) => void;
const disconnect = vi.fn();
const graph = { states: [], edges: [] };

beforeEach(() => {
  const { window } = parseHTML("<html><body><div id='root'></div></body></html>");
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", window.document);
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 16));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: typeof resize) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  fitView.mockClear();
  disconnect.mockClear();
  root = createRoot(window.document.getElementById("root")!);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(React.createElement(StateGraph, {
    graph: { ...graph }, simulations: [], viewport: "desktop",
  })));
}

function observe(width: number, height = 400) {
  resize([{ contentRect: { width, height } }]);
}

it("refits once per frame on width changes, not height changes or polls", async () => {
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(32));
  fitView.mockClear();
  observe(1200);
  observe(1200, 500);
  observe(1200.4);
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(fitView).not.toHaveBeenCalled();
  observe(600);
  observe(350);
  await act(async () => vi.advanceTimersByTimeAsync(16));
  expect(fitView).toHaveBeenCalledExactlyOnceWith({ padding: 0.1, duration: 200 });
});

it("ignores zero widths and cancels pending fits when unmounted", async () => {
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(32));
  fitView.mockClear();
  observe(0);
  observe(1000);
  await act(async () => vi.advanceTimersByTimeAsync(16));
  expect(fitView).not.toHaveBeenCalled();
  observe(0);
  observe(390);
  await act(async () => root.unmount());
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(fitView).not.toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalledOnce();
  root = createRoot(document.createElement("div"));
});
