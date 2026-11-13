import type { KrugDimension } from "../contracts";
import { KRUG_DIMENSIONS } from "../contracts";

export const RUBRIC: Record<KrugDimension, { question: string; principle: string }> = {
  clarity: { question: "Is the purpose of the page immediately apparent?", principle: "dont-make-me-think" },
  navigation: { question: "Is the next relevant action discoverable and conventional?", principle: "navigation" },
  hierarchy: { question: "Are important elements visually and semantically prioritized?", principle: "scanning-not-reading" },
  "cognitive-effort": { question: "How much interpretation does selecting an action require?", principle: "mindless-choices" },
  "copy-economy": { question: "Is text free of needless words, happy talk, stale claims?", principle: "omit-words" },
  consistency: { question: "Do labels and interactions behave predictably?", principle: "conventions" },
  feedback: { question: "Does the interface clearly respond to user input?", principle: "dont-make-me-think" },
  recovery: { question: "Can the user recover from an incorrect action?", principle: "navigation" },
  responsive: { question: "Does the same workflow remain functional on mobile?", principle: "scanning-not-reading" },
  "goal-completion": { question: "Can the intended outcome be verified?", principle: "testing-beats-arguing" },
};

export function rubricPromptSection(): string {
  return KRUG_DIMENSIONS.map((d) => `- ${d}: ${RUBRIC[d].question} (principle: ${RUBRIC[d].principle})`).join("\n");
}
