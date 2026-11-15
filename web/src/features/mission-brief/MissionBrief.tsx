import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Printer, X } from "lucide-react";
import {
  SITES,
  VERDICT_LABEL,
  getRecommendations,
  landingLabel,
  simulate,
  siteFor,
  useMission,
  useSim,
  usingRealData,
  wrapHour,
  type Verdict,
} from "@/core";

// "Mission brief" button in the planner header. Opens a one-page report of the current plan
// that can be printed or saved as a PDF (the browser's print dialog has "Save as PDF").
// The report is drawn in fixed light colours so it looks the same on screen, on paper and in a PDF.

const DELAY_TESTS = [24, 72, 120]; // 1, 3 and 5 days late
const VERDICT_COLOR: Record<Verdict, string> = { ok: "#15803d", warn: "#b45309", fail: "#b91c1c" };
const SUN = "#f59e0b";
const LINK_COLOR = { ok: "#2563eb", weak: "#f59e0b", lost: "#dc2626" } as const;
const DEG = "\u00B0";

// While printing, hide the app and print only the brief
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff !important; min-width: 0 !important; width: auto !important; height: auto !important; overflow: visible !important; }
  body > *:not(#mission-brief) { display: none !important; }
  #mission-brief { position: static !important; display: block !important; background: #fff !important; padding: 0 !important; overflow: visible !important; }
  #mission-brief .brief-paper { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; padding: 0 !important; }
  #mission-brief .no-print { display: none !important; }
  #mission-brief * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#e5e7eb] py-1.5">
      <span className="text-[#6b7280]">{label}</span>
      <span className="text-right font-semibold text-[#111827]">{value}</span>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-[#e5e7eb] p-3">
      <div className="text-[11px] text-[#6b7280]">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${warn ? "text-[#b91c1c]" : "text-[#111827]"}`}>{value}</div>
    </div>
  );
}

function Brief({ onClose }: { onClose: () => void }) {
  const params = useMission((s) => s.params);
  const r = useSim();
  const advice = useMemo(() => getRecommendations(params, r), [params, r]);
  const robust = useMemo(() => DELAY_TESTS.filter((d) => simulate(params, d).verdict !== "fail").length, [params]);
  const site = SITES[params.siteIdx];
  const data = siteFor(params);
  const n = params.durationDays * 24;
  const point = params.point && params.point.siteIdx === params.siteIdx ? params.point : null;
  const failDay = r.failHour !== null ? Math.floor(r.failHour / 24) + 1 : null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const print = () => {
    const old = document.title;
    document.title = `MoonScope Mission Brief - ${site.name} - ${landingLabel(params.delayH)} 2027`;
    const restore = () => {
      document.title = old;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  // Battery line: % of battery, one point per hour
  const battery = r.soc
    .slice(0, n)
    .map((v, k) => `${((k / Math.max(1, n - 1)) * 1000).toFixed(1)},${(60 - (v / params.batteryKwh) * 56).toFixed(1)}`)
    .join(" ");
  const reserveY = 60 - (r.reserve / params.batteryKwh) * 56;
  const w = 1000 / n;

  return (
    <div
      id="mission-brief"
      role="dialog"
      aria-modal="true"
      aria-label="Mission brief"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-[60] overflow-auto bg-black/70 p-4 backdrop-blur-sm"
    >
      <style>{PRINT_CSS}</style>
      <article className="brief-paper mx-auto max-w-[820px] rounded-2xl bg-white p-6 text-[13px] text-[#111827] shadow-2xl md:p-10">
        <div className="no-print mb-6 flex justify-end gap-2">
          <button
            type="button"
            data-keep-color
            onClick={print}
            className="flex items-center gap-2 rounded-full bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#115e59]"
          >
            <Printer size={16} /> Print / Save as PDF
          </button>
          <button
            ref={closeRef}
            type="button"
            data-keep-color
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full border border-[#d1d5db] text-[#374151] hover:bg-[#f3f4f6]"
          >
            <X size={16} />
          </button>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#111827] pb-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-[#6b7280] uppercase">MoonScope Mission Brief</p>
            <h1 className="mt-1 text-2xl font-bold">
              {site.name}
              {point ? ` (${point.label})` : ""}
            </h1>
            <p className="mt-1 text-[#4b5563]">
              Landing {landingLabel(params.delayH)} 2027 (UTC), {params.durationDays}-day mission. Made {today}.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-[#6b7280]">Result</div>
            <div className="text-2xl font-extrabold" style={{ color: VERDICT_COLOR[r.verdict] }}>
              {VERDICT_LABEL[r.verdict]}
            </div>
          </div>
        </header>

        <p className="mt-4 text-[14px] leading-relaxed">{advice.message}</p>

        <section className="mt-5 grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-bold">The plan</h2>
            <Row label="Landing site" value={site.name} />
            <Row label="Position" value={`${site.lat.toFixed(2)}${DEG}, ${site.lon.toFixed(2)}${DEG}`} />
            <Row label="Landing date" value={`${landingLabel(params.delayH)} 2027`} />
            <Row label="Mission length" value={`${params.durationDays} days`} />
            <Row label="Battery" value={`${params.batteryKwh} kWh`} />
            <Row label="Power use" value={`${params.loadKw.toFixed(1)} kW`} />
            <Row label="Solar panel efficiency" value={`${Math.round(params.panelEff * 100)}%`} />
            <Row label="Earth contact needed" value={`${params.commHoursReq} h per day`} />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-bold">Key numbers</h2>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Time in sunlight" value={pct(r.litPct)} />
              <Stat label="Earth contact" value={pct(r.earthOkPct)} />
              <Stat label="Lowest battery" value={`${r.minSoc.toFixed(0)} kWh`} warn={r.minSoc < r.reserve} />
              <Stat label="Safe minimum" value={`${r.reserve.toFixed(0)} kWh`} />
              <Stat label="Longest signal loss" value={`${r.longestBlackoutH} h`} warn={r.longestBlackoutH > 48} />
              <Stat
                label="First failure"
                value={failDay ? `Day ${failDay} (${r.cause === "power" ? "battery" : "Earth contact"})` : "None"}
                warn={failDay !== null}
              />
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold">Mission at a glance</h2>
          <div className="grid grid-cols-[84px_1fr] items-center gap-x-3 gap-y-1.5 text-[11px] text-[#4b5563]">
            <span>Sunlight</span>
            <svg viewBox="0 0 1000 14" preserveAspectRatio="none" className="h-4 w-full">
              {Array.from({ length: n }, (_, k) => (
                <rect key={k} x={k * w} y={0} width={w + 0.6} height={14} fill={data.lit[wrapHour(k + params.delayH)] ? SUN : "#e5e7eb"} />
              ))}
            </svg>
            <span>Earth link</span>
            <svg viewBox="0 0 1000 14" preserveAspectRatio="none" className="h-4 w-full">
              {Array.from({ length: n }, (_, k) => (
                <rect key={k} x={k * w} y={0} width={w + 0.6} height={14} fill={LINK_COLOR[data.earth[wrapHour(k + params.delayH)]]} />
              ))}
            </svg>
            <span>Battery</span>
            <svg viewBox="0 0 1000 60" preserveAspectRatio="none" className="h-14 w-full rounded border border-[#e5e7eb]">
              <line x1={0} x2={1000} y1={reserveY} y2={reserveY} stroke="#dc2626" strokeDasharray="8 6" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <polyline points={battery} fill="none" stroke="#0f766e" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
            <span />
            <div className="flex justify-between text-[10px]">
              <span>Day 1</span>
              <span>Red dashed line = safe minimum</span>
              <span>Day {params.durationDays}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[#4b5563]">
            Sunlight: orange = Sun above the hills. Earth link: blue = good, orange = weak, red = lost.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold">What we recommend</h2>
          <p className="mb-2 text-[#4b5563]">
            Delay test: the plan still works for <b className="text-[#111827]">{robust} of 3</b> late landings (1, 3 or 5 days late).
          </p>
          {advice.recommendations.length > 0 ? (
            <ol className="list-decimal space-y-1.5 pl-5">
              {advice.recommendations.slice(0, 4).map((rec) => (
                <li key={rec.id}>
                  <b>{rec.title}</b>: {rec.improvement}{" "}
                  <span className="font-semibold" style={{ color: VERDICT_COLOR[rec.result.verdict] }}>
                    ({VERDICT_LABEL[rec.result.verdict]})
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p>{advice.isSafe ? "No changes needed." : "No simple fix found. Try a larger battery or a different landing site."}</p>
          )}
        </section>

        <footer className="mt-8 border-t border-[#e5e7eb] pt-3 text-[10px] leading-relaxed text-[#6b7280]">
          {usingRealData()
            ? "Data: NASA LRO LOLA terrain and NAIF SPICE Sun/Earth positions (DE440), hour by hour. Sunlight checked against NASA PGDA product 69."
            : "WARNING: made with sample data, not the real NASA data."}{" "}
          Made with MoonScope, {window.location.origin}. A planning aid, not a flight-certified tool.
        </footer>
      </article>
    </div>
  );
}

export function MissionBrief() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour="mission-brief"
        title="A one-page report of this plan that you can print or save as a PDF"
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-text"
      >
        <FileText size={14} /> Mission brief
      </button>
      {open && createPortal(<Brief onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
