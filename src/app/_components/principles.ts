import { USABILITY_PRINCIPLES, type UsabilityPrinciple } from "@/lib/contracts";

export function isUsabilityPrinciple(value: string): value is UsabilityPrinciple {
  return value in USABILITY_PRINCIPLES;
}

/** Find a principle by slug or by its plain-language title (the value spec files carry). */
export function findPrinciple(value: string): UsabilityPrinciple | undefined {
  const key = value.trim();
  if (isUsabilityPrinciple(key)) return key;
  const slug = (Object.keys(USABILITY_PRINCIPLES) as UsabilityPrinciple[]).find(
    (s) => USABILITY_PRINCIPLES[s].title === key,
  );
  return slug;
}
