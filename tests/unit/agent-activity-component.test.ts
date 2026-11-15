import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentActivity } from "@/components/agent-activity";
import type { PanelState } from "@/lib/contracts";

vi.mock("@/app/_components/panel", () => ({
  Panel: ({ state, children }: { state: PanelState; children: ReactNode }) =>
    React.createElement("section", null, state.kind === "ready" ? children :
      state.kind === "loading" ? state.label : state.message),
}));
vi.mock("@/components/ui/banner", () => ({
  Banner: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
  BannerTitle: ({ children }: { children: ReactNode }) => React.createElement("strong", null, children),
  BannerDescription: ({ children }: { children: ReactNode }) => React.createElement("p", null, children),
}));

let root: Root;
let container: HTMLElement;
const fetchMock = vi.fn();

beforeEach(() => {
  const { window } = parseHTML("<html><body><div id='root'></div></body></html>");
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", window.document);
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
  fetchMock.mockReset();
  container = window.document.getElementById("root")!;
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(live = false) {
  await act(async () => root.render(React.createElement(AgentActivity, { id: "exp_1234abcd", live })));
  await act(async () => vi.advanceTimersByTimeAsync(0));
}

describe("activity fetch feedback", () => {
  it("shows HTTP failures rather than an empty feed", async () => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 500 }));
    await render();
    expect(container.textContent).toContain("Couldn't load activity");
    expect(container.textContent).toContain("500");
    expect(container.textContent).not.toContain("Nothing logged yet");
  });

  it("shows network failures and recovers on a successful empty poll", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockResolvedValue(Response.json([]));
    await render(true);
    expect(container.textContent).toContain("Couldn't load activity");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(container.textContent).not.toContain("Couldn't load activity");
    expect(container.textContent).toContain("Waiting for the first move");
  });

  it("retains events on a failed poll and clears the error on recovery", async () => {
    const events = [{ ts: "2026-01-01T00:00:00Z", stage: "discover", kind: "info", message: "Exploring the page" }];
    fetchMock.mockResolvedValueOnce(Response.json(events))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(Response.json(events));
    await render(true);
    expect(container.textContent).toContain("Exploring the page");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(container.textContent).toContain("Exploring the page");
    expect(container.textContent).toContain("Couldn't load activity");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(container.textContent).toContain("Exploring the page");
    expect(container.textContent).not.toContain("Couldn't load activity");
  });

  it("keeps the empty message for a successful empty response", async () => {
    fetchMock.mockResolvedValue(Response.json([]));
    await render();
    expect(container.textContent).toContain("Nothing logged yet");
    expect(container.textContent).not.toContain("Couldn't load activity");
  });
});
