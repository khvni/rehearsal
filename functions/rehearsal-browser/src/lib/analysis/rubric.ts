import type { RubricDimension, UsabilityPrinciple } from "../contracts";
import { RUBRIC_DIMENSIONS } from "../contracts";

export const RUBRIC: Record<RubricDimension, { question: string; principle: UsabilityPrinciple }> = {
  clarity: { question: "Is the purpose of the page immediately apparent?", principle: "dont-make-users-think" },
  navigation: { question: "Is the next relevant action discoverable and conventional?", principle: "where-you-are" },
  hierarchy: { question: "Are important elements visually and semantically prioritized?", principle: "people-scan-they-dont-read" },
  "cognitive-effort": { question: "How much interpretation does selecting an action require?", principle: "obvious-choices" },
  "copy-economy": { question: "Is text free of needless words, happy talk, stale claims?", principle: "cut-needless-words" },
  consistency: { question: "Do labels and interactions behave predictably?", principle: "familiar-conventions" },
  feedback: { question: "Does the interface clearly respond to user input?", principle: "dont-make-users-think" },
  recovery: { question: "Can the user recover from an incorrect action?", principle: "where-you-are" },
  responsive: { question: "Does the same workflow remain functional on mobile?", principle: "people-scan-they-dont-read" },
  "goal-completion": { question: "Can the intended outcome be verified?", principle: "test-dont-argue" },
};

export function rubricPromptSection(): string {
  return RUBRIC_DIMENSIONS.map((d) => `- ${d}: ${RUBRIC[d].question} (principle: ${RUBRIC[d].principle})`).join("\n");
}
