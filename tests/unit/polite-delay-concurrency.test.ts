import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { politeDelay } from "@/lib/fetch/guards";

/** Starts `n` politeDelay calls at once; returns the fake ms at which each one resolved. */
async function concurrentReleaseTimes(url: string, n: number): Promise<number[]> {
  const target = new URL(url);
  const start = Date.now();
  const released: number[] = [];
  const calls = Array.from({ length: n }, () => politeDelay(target).then(() => released.push(Date.now() - start)));
  await vi.advanceTimersByTimeAsync(n * 2000);
  await Promise.all(calls);
  return released.sort((a, b) => a - b);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("politeDelay under concurrency", () => {
  it("spaces concurrent callers to one request per 2s per host", async () => {
    expect(await concurrentReleaseTimes("https://swarm.example.com/", 5)).toEqual([0, 2000, 4000, 6000, 8000]);
  });

  it("keeps hosts independent", async () => {
    const a = concurrentReleaseTimes("https://a.example.com/", 2);
    const b = concurrentReleaseTimes("https://b.example.com/", 2);
    expect(await Promise.all([a, b])).toEqual([
      [0, 2000],
      [0, 2000],
    ]);
  });

  it("does not wait once the interval has passed", async () => {
    const target = new URL("https://idle.example.com/");
    await politeDelay(target);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await concurrentReleaseTimes(target.href, 2)).toEqual([0, 2000]);
  });
});
