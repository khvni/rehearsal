import contractsFirst from "./contracts-first.mjs";
import findingCitesKrug from "./finding-cites-krug.mjs";

/** Local flat-config plugin: repo rules from AGENTS.md, enforced as lint. */
const plugin = {
  meta: { name: "eslint-plugin-rehearsal" },
  rules: {
    "contracts-first": contractsFirst,
    "finding-cites-krug": findingCitesKrug,
  },
};

export default plugin;
