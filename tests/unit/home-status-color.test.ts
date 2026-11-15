import { describe, expect, it } from "vitest";
import { statusColor } from "../../src/app/_components/status-color";

describe("home experiment status color", () => {
  it.each(["queued", "discovering", "simulating", "verifying", "analyzing", "comparing", "rebuilding"])(
    "shows %s as running",
    (status) => expect(statusColor(status)).toBe("blue"),
  );

  it.each([
    ["complete", "green"],
    ["failed", "red"],
    ["created", "gray"],
    ["", "gray"],
    ["unknown", "gray"],
  ])("shows %s as %s", (status, color) => {
    expect(statusColor(status)).toBe(color);
  });
});
