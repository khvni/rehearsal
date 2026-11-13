/**
 * Findings must cite a Krug principle (AGENTS.md "Evidence classes").
 * Any object literal with both `category` and `title` keys is treated as a Finding
 * and must set `krugPrinciple`. Objects with a spread are skipped (the spread may supply it).
 */

function keyName(prop) {
  if (prop.type !== "Property" || prop.computed) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal") return String(prop.key.value);
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const findingCitesKrug = {
  meta: {
    type: "problem",
    docs: { description: "Finding object literals must include krugPrinciple" },
    schema: [],
    messages: {
      missingPrinciple:
        "Finding-shaped object (has `category` and `title`) must cite a Krug principle via `krugPrinciple` (docs/krug-principles.md).",
    },
  },
  create(context) {
    return {
      ObjectExpression(node) {
        if (node.properties.some((p) => p.type === "SpreadElement")) return;
        const keys = new Set(node.properties.map(keyName));
        if (keys.has("category") && keys.has("title") && !keys.has("krugPrinciple")) {
          context.report({ node, messageId: "missingPrinciple" });
        }
      },
    };
  },
};

export default findingCitesKrug;
