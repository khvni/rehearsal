import type { KrugPrinciple } from "@/lib/contracts";

export const KRUG_PRINCIPLES: Record<KrugPrinciple, { code: string; name: string; summary: string }> = {
  "dont-make-me-think": {
    code: "K1",
    name: "Don't make me think",
    summary: "Pages should be self-evident; every question a visitor has to ask adds friction.",
  },
  "scanning-not-reading": {
    code: "K2",
    name: "Scanning, not reading",
    summary: "People scan and satisfice, so hierarchy and clickable things must be obvious at a glance.",
  },
  conventions: {
    code: "K3",
    name: "Conventions",
    summary: "Use familiar patterns; innovate only when the new idea clearly beats the convention.",
  },
  "mindless-choices": {
    code: "K4",
    name: "Mindless choices",
    summary: "Each click should be an unambiguous, confident choice; effort matters more than click count.",
  },
  "omit-words": {
    code: "K5",
    name: "Omit needless words",
    summary: "Cut half the words, then half again. No happy talk, no instructions nobody reads.",
  },
  navigation: {
    code: "K6",
    name: "Navigation",
    summary: "Every page passes the trunk test: site ID, page name, sections, and where you are.",
  },
  homepage: {
    code: "K7",
    name: "Homepage",
    summary: "The homepage says what this is, what's here, and what to do, in one glance.",
  },
  "farmers-and-cowmen": {
    code: "K8",
    name: "Search and browse",
    summary: "Serve both searchers and browsers: visible search plus a browsable hierarchy.",
  },
  "testing-beats-arguing": {
    code: "K9",
    name: "Testing beats arguing",
    summary: "Test the interface instead of debating what users like.",
  },
};

export function isKrugPrinciple(value: string): value is KrugPrinciple {
  return value in KRUG_PRINCIPLES;
}
