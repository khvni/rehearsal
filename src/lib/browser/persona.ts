import { writeFileSync } from "node:fs";
import path from "node:path";
import type {
  AssertionProbe,
  PersonaDriver,
  PersonaPage,
  PersonaSnapshot,
  TrajectoryAction,
  Viewport,
} from "../contracts";
import { type extractPage, isSameOrigin, memoizedExtractPage } from "./extract";
import { assertPublicUrl } from "../fetch/guards";

/**
 * PersonaDriver over a live page — shared by PlaywrightRunner, StagehandRunner
 * and the hermetic bench/spec-delta runners. The loop reads rendered DOM via
 * `outerHTML` extraction (same extraction as discovery, so stateHashes
 * correlate with the crawled graph) and clicks via role locators; same-origin
 * links may navigate directly.
 */
export class LivePagePersonaDriver implements PersonaDriver {
  constructor(
    private page: PersonaPage,
    private viewport: Viewport,
    private evidenceDir: string | undefined,
    private navTimeoutMs = 15000,
    private extract: typeof extractPage = memoizedExtractPage(),
  ) {}

  private async currentUrl(): Promise<string> {
    return await this.page.url();
  }

  async snapshot(): Promise<PersonaSnapshot> {
    const url = await this.currentUrl();
    const html = await this.page.evaluate<string>(
      "document.documentElement ? document.documentElement.outerHTML : ''",
    );
    const extracted = this.extract(html ?? "", url);
    const actions = extracted.actions.map((a) => ({ label: a.label, role: a.role }));
    const candidates: TrajectoryAction[] = extracted.actions
      .map((a, i) => ({ a, actionId: `act_${i}` }))
      .filter(({ a }) => a.enabled && a.safeToExecute)
      .map(({ a, actionId }) => ({ actionId, label: a.label, href: a.href, role: a.role }));
    return { url, title: extracted.title, visibleText: extracted.visibleText, actions, candidates };
  }

  async act(action: TrajectoryAction): Promise<{ ok: boolean; error?: string }> {
    try {
      const origin = new URL(await this.currentUrl()).origin;
      const href = action.href && isSameOrigin(action.href, origin) ? action.href : null;
      if (href) {
        await assertPublicUrl(href);
        await this.page.goto(href, { waitUntil: "domcontentloaded", timeout: this.navTimeoutMs });
      } else {
        const submits = await this.page.evaluate<boolean>(`(() => {
          const normalize = (text) => (text || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          const label = normalize(${JSON.stringify(action.label)});
          return Array.from(document.querySelectorAll('button')).some((el) => {
            if (!(el instanceof HTMLButtonElement) || el.form === null || el.type !== 'submit') return false;
            const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\\s+/)
              .map((id) => document.getElementById(id)?.textContent || '').join(' ');
            return [labelledBy, el.getAttribute('aria-label'), el.textContent, el.getAttribute('title')]
              .some((text) => normalize(text).includes(label));
          });
        })()`);
        if (submits) return { ok: false, error: "Refusing to click a form submit button" };
        const loc =
          action.role === "button"
            ? this.page.getByRole("button", { name: action.label })
            : this.page.getByRole("link", { name: action.label });
        await loc.first().click({ timeout: 8000 });
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: this.navTimeoutMs })
          .catch(() => undefined);
      }
      const landed = await this.currentUrl();
      await assertPublicUrl(landed).catch(async (e) => {
        await this.page.goto("about:blank").catch(() => undefined);
        throw e;
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160) };
    }
  }

  probe(): AssertionProbe {
    const page = this.page;
    return {
      bodyText: () =>
        page
          .evaluate<string>("document.body ? document.body.textContent || '' : ''")
          .catch(() => ""),
      isVisible: async (selector) =>
        page
          .evaluate<boolean>(
            `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); })()`,
          )
          .catch(() => false),
      count: async (selector) =>
        page
          .evaluate<number>(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
          .catch(() => 0),
      title: () => page.title().catch(() => ""),
      url: () => this.currentUrl(),
    };
  }

  async screenshot(name: string): Promise<string | null> {
    if (!this.evidenceDir) return null;
    try {
      const file = path.join(this.evidenceDir, `${name}.png`);
      writeFileSync(file, await this.page.screenshot({ timeout: 15000 }));
      return file;
    } catch {
      return null;
    }
  }
}
