import { z } from "zod";

// Sentry → GitHub first-responder loop (src/app/api/hooks/sentry, docs/telemetry.md).

/** A Sentry issue that should be handed to the first responder, normalized from an alert webhook. */
export const SentryAlert = z.object({
  issueId: z.string().min(1),
  title: z.string(),
  culprit: z.string().default(""),
  url: z.string(),
  level: z.string().optional(),
  project: z.string().optional(),
  /** Why it fired: `event_alert` rule label, or the issue webhook action (`created` / `regressed` / `escalating`). */
  reason: z.string(),
  tags: z.array(z.tuple([z.string(), z.string()])).default([]),
  eventUrl: z.string().optional(),
});
export type SentryAlert = z.infer<typeof SentryAlert>;

export const GithubIssueUpsert = z.object({
  action: z.enum(["created", "updated", "reopened", "skipped"]),
  number: z.number().int().optional(),
  reason: z.string().optional(),
});
export type GithubIssueUpsert = z.infer<typeof GithubIssueUpsert>;
