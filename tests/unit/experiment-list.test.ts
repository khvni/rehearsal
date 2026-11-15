import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import Home from "../../src/app/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  const { window } = parseHTML("<html><body><div id='root'></div></body></html>");
  vi.stubGlobal("window", window);
  vi.stubGlobal("self", window);
  vi.stubGlobal("document", window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = window.document.getElementById("root")!;
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it.each(["http", "network"])("shows a distinct error for %s failure", async (failure) => {
  vi.stubGlobal("fetch", failure === "network"
    ? vi.fn().mockRejectedValue(new Error("Offline"))
    : vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
  await act(async () => root.render(createElement(Home)));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not load experiments");
  expect(container.textContent).not.toContain("No experiments yet");
});

it("shows the empty state only for a successful empty list", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
  await act(async () => root.render(createElement(Home)));
  expect(container.textContent).toContain("No experiments yet");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("renders a successful experiment list", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{
    id: "past-run", targetUrl: "https://example.com", goal: "Find pricing",
    status: "complete", createdAt: "2026-01-01T00:00:00Z",
  }])));
  await act(async () => root.render(createElement(Home)));
  expect(container.querySelector('a[href="/experiments/past-run"]')?.textContent).toContain("Find pricing");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
