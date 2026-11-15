import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { politeDelay } from "@/lib/fetch/guards";

/** Calls politeDelay twice back to back; returns how many fake ms the second call waited. */
async function secondCallWaitMs(url: string): Promise<number> {
  const target = new URL(url);
  await politeDelay(target);
  let done = false;
  const second = politeDelay(target).then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  let waited = 0;
  while (!done && waited < 5000) {
    await vi.advanceTimersByTimeAsync(100);
    waited += 100;
  }
  await second;
  return waited;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
});

describe("politeDelay", () => {
  it("still waits 2s between requests to a public host, even with REHEARSAL_ALLOW_PRIVATE=1", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    expect(await secondCallWaitMs("https://example.com/a")).toBe(2000);
    expect(await secondCallWaitMs("http://203.0.113.5/a")).toBe(2000);
  });

  it("waits for loopback hosts when REHEARSAL_ALLOW_PRIVATE is unset", async () => {
    expect(await secondCallWaitMs("http://127.0.0.2:4000/")).toBe(2000);
  });

  it("waits for non-loopback private hosts with REHEARSAL_ALLOW_PRIVATE=1", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    expect(await secondCallWaitMs("http://10.0.0.5/")).toBe(2000);
  });

  it("skips the wait for loopback hosts with REHEARSAL_ALLOW_PRIVATE=1", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    for (const url of ["http://127.0.0.1:4000/", "http://localhost:4000/", "http://[::1]:4000/"]) {
      expect(await secondCallWaitMs(url)).toBe(0);
    }
  });
});
