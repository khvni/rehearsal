import contractsFirst from "./contracts-first.mjs";
import findingCitesPrinciple from "./finding-cites-principle.mjs";

/** Local flat-config plugin: repo rules from AGENTS.md, enforced as lint. */
const plugin = {
  meta: { name: "eslint-plugin-rehearsal" },
  rules: {
    "contracts-first": contractsFirst,
    "finding-cites-principle": findingCitesPrinciple,
  },
};

export default plugin;
