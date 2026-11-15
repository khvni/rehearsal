import { ImageResponse } from "next/og";
import { isExperimentId, type Experiment } from "@/lib/contracts";
import { experimentPreview, PREVIEW_TAGLINE, rebuildPreview } from "@/lib/link-preview";
import { Orchestrator } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __orchestrator?: Orchestrator };

const SIZE = { width: 1200, height: 630 };
const INK = "#111111";
const INK_2 = "#404040";
const MUTED = "#6b6b6b";
const HAIRLINE = "#ededed";
const SEVERITY_INK: Record<string, string> = { critical: "#a02a1d", high: "#b23a2a", medium: "#9a6200", low: "#767676" };
const STAGE_LABEL: Record<string, string> = {
  discover: "Discover",
  simulate: "Simulate",
  verify: "Verify",
  analyze: "Analyze",
  compare: "Compare",
  spec: "Spec",
};

/** Satori only paints hex/rgb/hsl; anything else (oklch, var()) falls back. */
function paint(value: string | undefined, fallback: string): string {
  return value && /^(#[\da-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(value.trim()) ? value.trim() : fallback;
}

function radiusPx(value: string, scale: number): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 8;
  return Math.round((value.trim().endsWith("rem") ? n * 16 : n) * scale);
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, color: INK, letterSpacing: -0.5 }}>
      <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: INK }} />
      Rehearsal
    </div>
  );
}

function Check({ done }: { done: boolean }) {
  return done ? (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="10" fill="none" stroke="#dcdcdc" strokeWidth="1.5" />
      <path d="M6.5 11.5l3 3 6-6.5" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="10" fill="none" stroke="#dcdcdc" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  );
}

function FindingsCard({ exp }: { exp: Experiment }) {
  const p = experimentPreview(exp);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#ffffff", padding: "56px 72px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark />
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 24, color: INK_2, border: `1.5px solid ${HAIRLINE}`, borderRadius: 999, padding: "6px 18px" }}>
          <div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: p.status === "complete" ? "#22C55E" : p.status === "failed" ? "#b23a2a" : "#F59E0B" }} />
          {p.status}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 52 }}>
        <div style={{ display: "flex", fontSize: 34, color: MUTED, letterSpacing: -0.3 }}>{p.host}</div>
        <div style={{ display: "flex", fontSize: 84, color: INK, letterSpacing: -3, lineHeight: 1.05, marginTop: 6 }}>{p.headline}</div>
        {p.counts.length > 0 && (
          <div style={{ display: "flex", gap: 28, fontSize: 34, marginTop: 18 }}>
            {p.counts.map((c) => (
              <div key={c.severity} style={{ display: "flex", color: SEVERITY_INK[c.severity] }}>
                {`${c.count} ${c.severity}`}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", borderTop: `1.5px solid ${HAIRLINE}`, paddingTop: 26 }}>
        <div style={{ display: "flex", fontSize: 30, color: INK, lineHeight: 1.3, letterSpacing: -0.3 }}>
          {p.topFinding ? `Start here: ${p.topFinding}` : `Goal: ${p.goal}`}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
          <div style={{ display: "flex", gap: 22 }}>
            {p.stages.map((s) => (
              <div key={s.stage} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 22, color: s.done ? INK_2 : "#9a9a9a" }}>
                <Check done={s.done} />
                {STAGE_LABEL[s.stage]}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: MUTED }}>
            {[p.journeys ? `${p.journeys.toLocaleString("en-US")} journeys` : "", p.date].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
    </div>
  );
}

function RebuildCard({ exp, path }: { exp: Experiment; path: string }) {
  const p = rebuildPreview(exp, path)!;
  const t = p.tokens;
  const bg = paint(t.background, "#ffffff");
  const fg = paint(t.foreground, INK);
  const primary = paint(t.primary, INK);
  const onPrimary = paint(t.primaryForeground, "#ffffff");
  const mutedFg = paint(t.mutedForeground, MUTED);
  const border = paint(t.border, HAIRLINE);
  const radius = radiusPx(t.radius, 0.7);
  const swatches = [bg, fg, primary, paint(t.card, bg), border];
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#ffffff" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 440, padding: "56px 0 56px 72px" }}>
        <Wordmark />
        <div style={{ display: "flex", fontSize: 26, color: MUTED, marginTop: 64 }}>Rebuilt site</div>
        <div style={{ display: "flex", fontSize: 72, color: INK, letterSpacing: -2.5, lineHeight: 1.05, marginTop: 6 }}>{p.brand}</div>
        <div style={{ display: "flex", fontSize: 26, color: INK_2, lineHeight: 1.35, marginTop: 20, paddingRight: 24 }}>
          {`${p.pagesBuilt} of ${p.pagesTotal} pages rebuilt from ${p.host}`}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 12 }}>
          <div style={{ display: "flex", fontSize: 20, color: MUTED }}>Design tokens</div>
          <div style={{ display: "flex", gap: 10 }}>
            {swatches.map((c, i) => (
              <div key={i} style={{ display: "flex", width: 40, height: 40, borderRadius: 10, background: c, border: "1.5px solid rgba(0,0,0,0.1)" }} />
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, padding: "48px 0 48px 8px", overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 760, height: "100%", borderRadius: "18px 0 0 18px", border: `1.5px solid ${HAIRLINE}`, borderRight: "none", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.12)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 18px", background: "#f5f5f5", borderBottom: `1.5px solid ${HAIRLINE}` }}>
            {["#e5e5e5", "#e5e5e5", "#e5e5e5"].map((c, i) => (
              <div key={i} style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: c }} />
            ))}
            <div style={{ display: "flex", marginLeft: 14, fontSize: 17, color: MUTED }}>{`rehearsal.alikhani.co/…/rb${p.path === "/" ? "/" : p.path}`}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, background: bg, color: fg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 22, height: 64, padding: "0 36px", borderBottom: `1px solid ${border}` }}>
              <div style={{ display: "flex", fontSize: 22, color: fg, marginRight: "auto" }}>{p.brand}</div>
              {p.nav.slice(1, 5).map((n, i) => (
                <div key={i} style={{ display: "flex", fontSize: 16, color: mutedFg }}>{n}</div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", padding: "44px 36px 0" }}>
              <div style={{ display: "flex", fontSize: 50, lineHeight: 1.08, letterSpacing: -1.5, color: fg, maxWidth: 640 }}>{p.heading}</div>
              {p.lede && <div style={{ display: "flex", fontSize: 22, lineHeight: 1.4, color: mutedFg, marginTop: 20, maxWidth: 600 }}>{p.lede}</div>}
              <div style={{ display: "flex", gap: 14, marginTop: 30 }}>
                {p.primary && (
                  <div style={{ display: "flex", fontSize: 19, padding: "12px 22px", borderRadius: radius, background: primary, color: onPrimary }}>{p.primary}</div>
                )}
                {p.secondary && (
                  <div style={{ display: "flex", fontSize: 19, padding: "12px 22px", borderRadius: radius, border: `1.5px solid ${border}`, color: fg }}>{p.secondary}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FallbackCard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#ffffff", padding: "56px 72px" }}>
      <Wordmark />
      <div style={{ display: "flex", fontSize: 76, color: INK, letterSpacing: -2.5, lineHeight: 1.08, marginTop: "auto", maxWidth: 900 }}>{PREVIEW_TAGLINE}</div>
      <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 24 }}>rehearsal.alikhani.co</div>
    </div>
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") === "rebuild" ? "rebuild" : "findings";
  const exp = isExperimentId(id) ? await (g.__orchestrator ??= new Orchestrator()).get(id).catch(() => null) : null;
  const body =
    !exp ? <FallbackCard /> : view === "rebuild" && exp.rebuild?.site ? <RebuildCard exp={exp} path={url.searchParams.get("path") ?? "/"} /> : <FindingsCard exp={exp} />;
  return new ImageResponse(body, {
    ...SIZE,
    headers: { "cache-control": exp ? "public, max-age=300, s-maxage=3600" : "public, max-age=60" },
  });
}
