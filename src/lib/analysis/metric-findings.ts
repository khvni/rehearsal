import { createHash } from "node:crypto";
import type { Finding, SiteState } from "../contracts";
import { normalizeUrl } from "../browser/extract";
import type { PageMetrics } from "../browser/metrics";

/** Rule thresholds for metric findings (docs/krug-principles.md K2/K4/K6/K7). */
export const METRIC_RULES = {
  /** Homepage screens of scrolling: >= low → low, >= medium → medium (K2). */
  longScrollScreens: { low: 4, medium: 8 },
  /** Above-fold CTAs tied for most prominent before the choice stops being mindless (K4). */
  maxEquallyProminentCtas: 2,
  /** Krug/Miller-style ceiling on primary nav items; > high → medium (K6). */
  navItems: { max: 7, high: 12 },
} as const;

type Measured = SiteState & { metrics: PageMetrics };
type Severity = Finding["severity"];
const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const vpLabel = (s: SiteState) => s.viewport.name[0].toUpperCase() + s.viewport.name.slice(1);
const shots = (states: SiteState[]) => [...new Set(states.map((s) => s.screenshotPath).filter((p): p is string => !!p))].slice(0, 6);

interface Group {
  key: string;
  states: Measured[];
  severity: Severity;
}

function group(items: { key: string; state: Measured; severity: Severity }[]): Group[] {
  const map = new Map<string, Group>();
  for (const { key, state, severity } of items) {
    const g = map.get(key) ?? { key, states: [], severity };
    g.states.push(state);
    if (RANK[severity] > RANK[g.severity]) g.severity = severity;
    map.set(key, g);
  }
  return [...map.values()];
}

function finding(rule: string, g: Group, f: Omit<Finding, "findingId" | "affectedStates" | "affectedActions" | "evidencePaths" | "severity" | "evidenceType" | "verificationStatus">): Finding {
  const id = createHash("sha1").update(g.key).digest("hex").slice(0, 8);
  return {
    findingId: `f_metric_${rule}_${id}`,
    severity: g.severity,
    evidenceType: "reproducible-concern",
    verificationStatus: "reproduced",
    affectedStates: g.states.map((s) => s.stateId),
    affectedActions: [],
    evidencePaths: shots(g.states),
    ...f,
  };
}

/**
 * Deterministic findings from PageMetrics: scroll length, CTA dominance, nav size,
 * heading outline, visual hierarchy and the trunk test. Findings are grouped across
 * states that share the same issue (per viewport where the measurement is layout-bound).
 */
export function metricFindings(states: SiteState[], opts: { homepageUrl?: string } = {}): Finding[] {
  const measured = states.filter((s): s is Measured => !!s.metrics);
  if (measured.length === 0) return [];
  const home = normalizeUrl(opts.homepageUrl ?? states[0].url);
  const isHome = (s: SiteState) => normalizeUrl(s.url) === home;
  const out: Finding[] = [];

  // K2 — homepage requires N screens of scrolling.
  for (const g of group(
    measured.flatMap((state) => {
      const r = state.metrics.foldRatio;
      if (!isHome(state) || r === null || r < METRIC_RULES.longScrollScreens.low) return [];
      return [{ key: `scroll|${state.viewport.name}`, state, severity: (r >= METRIC_RULES.longScrollScreens.medium ? "medium" : "low") as Severity }];
    }),
  )) {
    const m = g.states[0].metrics;
    out.push(
      finding("long-scroll", g, {
        title: `${vpLabel(g.states[0])}: homepage requires ${m.foldRatio} screens of scrolling`,
        category: "hierarchy",
        krugPrinciple: "scanning-not-reading",
        description: `The homepage is ${m.pageHeightPx}px tall at a ${m.viewportHeightPx}px viewport — ${m.foldRatio} screens, roughly ${m.estimatedScrollTimeSec}s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top.`,
        recommendation: "Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.",
      }),
    );
  }

  // K7 — nothing to do above the fold on the homepage.
  for (const g of group(
    measured
      .filter((s) => isHome(s) && s.metrics.aboveFoldCtaCount === 0)
      .map((state) => ({ key: `no-cta|${state.viewport.name}`, state, severity: "medium" as Severity })),
  )) {
    out.push(
      finding("no-cta-above-fold", g, {
        title: `${vpLabel(g.states[0])}: no call to action above the fold on the homepage`,
        category: "clarity",
        krugPrinciple: "homepage",
        description: "No button or button-styled link is visible in the first screen, so \"What can I do here?\" goes unanswered at a glance.",
        recommendation: "Place one clearly styled primary action in the first screen.",
      }),
    );
  }

  // K4 — no single dominant CTA above the fold.
  for (const g of group(
    measured
      .filter((s) => (s.metrics.primaryCtaAmbiguity ?? 0) > METRIC_RULES.maxEquallyProminentCtas)
      .map((state) => ({ key: `cta|${state.viewport.name}`, state, severity: "medium" as Severity })),
  )) {
    const worst = g.states.reduce((a, b) => ((b.metrics.primaryCtaAmbiguity ?? 0) > (a.metrics.primaryCtaAmbiguity ?? 0) ? b : a));
    const labels = worst.metrics.primaryCtaLabels.map((l) => `"${l}"`).join(", ");
    out.push(
      finding("cta-ambiguity", g, {
        title: `${vpLabel(worst)}: no single dominant call to action above the fold`,
        category: "cognitive-effort",
        krugPrinciple: "mindless-choices",
        description: `${worst.metrics.primaryCtaAmbiguity} above-the-fold actions are equally prominent by size${labels ? ` (${labels})` : ""} on "${worst.pageTitle}", so visitors must stop and compare instead of making a mindless choice.`,
        recommendation: "Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.",
      }),
    );
  }

  // K6 — primary nav has too many items.
  for (const g of group(
    measured
      .filter((s) => s.metrics.navItemCount > METRIC_RULES.navItems.max)
      .map((state) => ({
        key: `nav|${state.viewport.name}`,
        state,
        severity: (state.metrics.navItemCount > METRIC_RULES.navItems.high ? "medium" : "low") as Severity,
      })),
  )) {
    const max = Math.max(...g.states.map((s) => s.metrics.navItemCount));
    out.push(
      finding("nav-overload", g, {
        title: `${vpLabel(g.states[0])}: primary navigation has ${max} items`,
        category: "navigation",
        krugPrinciple: "navigation",
        description: `The top navigation exposes up to ${max} visible items (more than ${METRIC_RULES.navItems.max}), which makes the major sections harder to name at a glance.`,
        recommendation: `Group navigation into ${METRIC_RULES.navItems.max} or fewer top-level sections; move the rest into sub-navigation or the footer.`,
      }),
    );
  }

  // K2 — heading outline: missing/multiple h1, skipped levels. DOM-level, so grouped across viewports.
  const seenOutline = new Set<string>();
  const outlineItems = measured.flatMap((state) => {
    const h = state.metrics.headingOutline;
    const issues = [
      ...(h.h1Count === 0 ? ["no h1"] : h.h1Count > 1 ? [`${h.h1Count} h1 elements`] : []),
      ...(h.skippedLevels.length > 0 ? [`skips ${h.skippedLevels.join(", ")}`] : []),
    ];
    return issues.length > 0 ? [{ key: `outline|${issues.join("; ")}`, state, severity: "low" as Severity, issues }] : [];
  });
  for (const g of group(outlineItems)) {
    const issues = g.key.split("|")[1];
    if (seenOutline.has(issues)) continue;
    seenOutline.add(issues);
    const urls = [...new Set(g.states.map((s) => s.url))];
    out.push(
      finding("heading-outline", g, {
        title: `Heading outline is broken: ${issues}`,
        category: "hierarchy",
        krugPrinciple: "scanning-not-reading",
        description: `${urls.length} page(s) have a heading outline with ${issues}${g.states[0].metrics.headingOutline.h1Text.length ? ` (h1: ${g.states[0].metrics.headingOutline.h1Text.map((t) => `"${t}"`).join(", ")})` : ""}. Headings are the scanning skeleton; gaps and competing h1s blur what matters most.`,
        recommendation: "Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.",
      }),
    );
  }

  // K2 — the visually largest text is not the h1.
  for (const g of group(
    measured
      .filter((s) => s.metrics.largestTextIsH1 === false && s.metrics.headingOutline.h1Count > 0)
      .map((state) => ({ key: `largest|${state.viewport.name}`, state, severity: "low" as Severity })),
  )) {
    out.push(
      finding("hierarchy-mismatch", g, {
        title: `${vpLabel(g.states[0])}: largest text on the page is not the h1`,
        category: "hierarchy",
        krugPrinciple: "scanning-not-reading",
        description: `On ${g.states.length} page(s) some other text renders larger than the h1, so visual prominence doesn't match importance.`,
        recommendation: "Make the page's h1 the most prominent text, or promote the largest text to be the h1.",
      }),
    );
  }

  // K6 — trunk test.
  const SIGNALS: [keyof PageMetrics["trunkTest"], string][] = [
    ["hasSiteName", "site ID"],
    ["hasPageName", "page name"],
    ["hasPrimaryNav", "primary navigation"],
    ["hasSearch", "search"],
    ["hasYouAreHere", "you-are-here indicator"],
  ];
  for (const g of group(
    measured.flatMap((state) => {
      const t = state.metrics.trunkTest;
      const missing = SIGNALS.filter(([k]) => !t[k] && !(k === "hasYouAreHere" && isHome(state))).map(([, label]) => label);
      if (missing.length === 0) return [];
      const severity: Severity =
        missing.length >= 3 ? "high" : !t.hasSiteName || !t.hasPageName ? "medium" : "low";
      return [{ key: `trunk|${state.viewport.name}|${missing.join(", ")}`, state, severity }];
    }),
  )) {
    const missing = g.key.split("|")[2];
    out.push(
      finding("trunk-test", g, {
        title: `${vpLabel(g.states[0])}: trunk test fails — missing ${missing}`,
        category: "navigation",
        krugPrinciple: "navigation",
        description: `On ${g.states.length} page(s) a visitor dropped in cold can't find: ${missing}. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are.`,
        recommendation: `Add the missing trunk-test signals (${missing}) to the persistent header on every page.`,
      }),
    );
  }

  return out;
}
