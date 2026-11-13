import type { DomPatch } from "../contracts";

/**
 * Compile DomPatch[] into a self-contained client-side script.
 * Applied inside a fresh Playwright context via addInitScript — the live site
 * is never touched. Deterministic: same patches => same script.
 */
export function compilePatches(patches: DomPatch[]): string {
  const serialized = JSON.stringify(patches);
  return `(() => {
  const patches = ${serialized};
  const apply = () => {
    for (const p of patches) {
      try {
        const els = document.querySelectorAll(p.selector);
        for (const el of els) {
          switch (p.op) {
            case 'replaceText': {
              const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              let n; while ((n = w.nextNode())) {
                if (n.textContent && n.textContent.includes(p.value)) {
                  n.textContent = n.textContent.split(p.value).join(p.newText ?? p.value);
                }
              }
              break;
            }
            case 'relabel': if (el.firstChild) el.firstChild.textContent = p.value; else el.textContent = p.value; break;
            case 'setStyle': el.style.cssText += ';' + p.value; break;
            case 'setAttribute': { const [k,v] = p.value.split('='); if (k) el.setAttribute(k, v ?? ''); break; }
            case 'insertNotice': {
              const d = document.createElement('div');
              d.textContent = p.value;
              d.style.cssText = 'background:#fef3c7;color:#78350f;padding:8px 12px;font:600 14px/1.4 system-ui;text-align:center;border-bottom:1px solid #f59e0b;position:relative;z-index:99999;';
              el.prepend(d);
              break;
            }
            case 'reorder': { const parent = el.parentElement; if (parent) parent.prepend(el); break; }
          }
        }
      } catch (e) { /* patch failure recorded via console */ console.warn('rehearsal-patch', e); }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: false });
})();`;
}

/** A patch set is reproducible iff compiling twice yields identical output. */
export function patchesIdempotent(patches: DomPatch[]): boolean {
  return compilePatches(patches) === compilePatches(patches);
}
