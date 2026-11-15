const RUNNING = ["queued", "discovering", "simulating", "verifying", "analyzing", "comparing", "rebuilding"];

export function statusColor(status: string): "green" | "red" | "blue" | "gray" {
  if (status === "complete") return "green";
  if (status === "failed") return "red";
  if (RUNNING.includes(status)) return "blue";
  return "gray";
}
