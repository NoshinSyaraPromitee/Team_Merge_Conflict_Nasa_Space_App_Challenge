import { useMemo, useState } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { ArrowDownToLine, RadioTower } from "lucide-react";
import { SITES, VERDICT_LABEL, getSite, simulate, useMission, type SimResult } from "@/core";

// Landing accuracy check. A lander rarely touches down exactly on target: it can land hundreds of metres
// to about a kilometre away. This panel re-runs the whole mission at the 25 computed points around the site
// (a 5 x 5 grid, 1 km apart, north up) and shows where the plan still works. Click a square to plan there.

const KM = [-2, -1, 0, 1, 2];
const CELL = { ok: "bg-ok/30 border-ok/60", warn: "bg-warn/30 border-warn/60", fail: "bg-fail/30 border-fail/60" } as const;

function where(dx: number, dy: number) {
  if (dx === 0 && dy === 0) return "site centre";
  const parts: string[] = [];
  if (dy) parts.push(`${Math.abs(dy)} km ${dy > 0 ? "north" : "south"}`);
  if (dx) parts.push(`${Math.abs(dx)} km ${dx > 0 ? "east" : "west"}`);
  return parts.join(", ");
}

type Spot = { dx: number; dy: number; r: SimResult };
type Drop = { id: number; dx: number; dy: number };

// Random landing miss: about 1 km typical error in each direction (rounded to the 1 km grid, kept inside it)
function scatter(cx: number, cy: number): { dx: number; dy: number } {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const clamp = (v: number) => Math.max(-2, Math.min(2, Math.round(v)));
  return { dx: clamp(cx + gauss() * 0.9), dy: clamp(cy + gauss() * 0.9) };
}

function outcome(r: SimResult) {
  if (r.verdict === "ok") return "the mission works";
  if (r.verdict === "warn") return "the mission is at risk";
  return r.cause === "comm" ? "the mission fails: Earth is hidden" : "the mission fails: the battery runs out";
}

// Small lander drawn in SVG (body, legs, foot pads)
function Lander() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 drop-shadow" aria-hidden>
      <rect x="9" y="6" width="14" height="11" rx="2" fill="#e5e7eb" />
      <rect x="12" y="9" width="8" height="4" rx="1" fill="#2563eb" />
      <path d="M10 17 L5 27 M22 17 L27 27 M14 17 L12 27 M18 17 L20 27" stroke="#d1d5db" strokeWidth="1.8" />
      <path d="M3 27 H8 M24 27 H29" stroke="#d1d5db" strokeWidth="2" />
    </svg>
  );
}

export function LandingCheck() {
  const params = useMission((s) => s.params);
  const patch = useMission((s) => s.patch);
  const [drops, setDrops] = useState<Drop[]>([]);
  const hasGrid = Boolean(getSite(params.siteIdx).grid);
  const cur = params.point && params.point.siteIdx === params.siteIdx ? params.point : { dxKm: 0, dyKm: 0 };

  // simulate() adds the offset to the current point, so subtract it to test each absolute grid point
  const spots = useMemo<Spot[]>(() => {
    if (!hasGrid) return [];
    return KM.flatMap((dy) =>
      KM.map((dx) => ({ dx, dy, r: simulate(params, 0, 1, { dxKm: dx - cur.dxKm, dyKm: dy - cur.dyKm }) })),
    );
  }, [params, hasGrid, cur.dxKm, cur.dyKm]);

  if (!hasGrid) {
    return <p className="text-sm text-muted">This check needs the real NASA data (it uses the terrain around each site).</p>;
  }

  const works = spots.filter((s) => s.r.verdict !== "fail");
  const near = spots.filter((s) => Math.abs(s.dx - cur.dxKm) <= 1 && Math.abs(s.dy - cur.dyKm) <= 1);
  const nearWorks = near.filter((s) => s.r.verdict !== "fail").length;
  const best = [...spots].sort((a, b) => {
    const rank = { ok: 0, warn: 1, fail: 2 } as const;
    return rank[a.r.verdict] - rank[b.r.verdict] || b.r.minSoc - a.r.minSoc;
  })[0];
  const here = spots.find((s) => s.dx === cur.dxKm && s.dy === cur.dyKm)!;
  const isHere = (s: Spot) => s.dx === cur.dxKm && s.dy === cur.dyKm;
  const last = drops[drops.length - 1];
  const lastSpot = last && spots.find((s) => s.dx === last.dx && s.dy === last.dy);
  const survived = drops.filter((d) => spots.find((s) => s.dx === d.dx && s.dy === d.dy)?.r.verdict !== "fail").length;
  const tryLanding = () => setDrops((d) => [...d.slice(-19), { id: Date.now(), ...scatter(cur.dxKm, cur.dyKm) }]);

  const go = (s: Spot) =>
    patch({
      point:
        s.dx === 0 && s.dy === 0
          ? undefined
          : { siteIdx: params.siteIdx, dxKm: s.dx, dyKm: s.dy, label: `${SITES[params.siteIdx].name}, ${where(s.dx, s.dy)}` },
    });

  return (
    <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center">
      <div>
        <div className="mb-1 text-center text-[10px] text-muted">North</div>
        <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Plan result at 25 points around the site">
          {[...spots]
            .sort((a, b) => b.dy - a.dy || a.dx - b.dx)
            .map((s) => (
              <button
                key={`${s.dx},${s.dy}`}
                type="button"
                onClick={() => go(s)}
                aria-pressed={isHere(s)}
                data-keep-color
                title={`${where(s.dx, s.dy)}: ${VERDICT_LABEL[s.r.verdict]}, lowest battery ${s.r.minSoc.toFixed(0)} kWh, Earth contact ${Math.round(s.r.earthOkPct * 100)}%`}
                className={clsx(
                  "grid size-11 place-items-center rounded-md border text-[10px] font-semibold transition hover:scale-105 sm:size-12",
                  CELL[s.r.verdict],
                  s.dx === 0 && s.dy === 0 && "border-2 border-dashed border-text/80",
                  isHere(s) && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                  "relative",
                )}
              >
                {last && last.dx === s.dx && last.dy === s.dy && (
                  <motion.span
                    key={last.id}
                    className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
                    initial={{ y: -90, opacity: 0, scale: 1.6 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  >
                    <Lander />
                    <motion.span
                      className="absolute inset-0 rounded-md border-2 border-white"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: [0, 1, 0], scale: [0.6, 1.4, 1.8] }}
                      transition={{ duration: 0.7, delay: 0.85 }}
                    />
                  </motion.span>
                )}
                {s.r.verdict === "fail" && s.r.cause === "comm" ? <RadioTower size={14} aria-label="not enough Earth contact" /> : s.r.minSoc.toFixed(0)}
              </button>
            ))}
        </div>
        <div className="mt-2 max-w-[17rem] text-center text-[10px] leading-snug text-muted">
          Squares are 1 km apart. Number = lowest battery (kWh). Radio icon = not enough Earth contact.
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <p>
          A lander can touch down up to about 1 km from its target. We re-ran your whole mission at 25 points around{" "}
          <b>{SITES[params.siteIdx].name}</b>.
        </p>
        <p className="text-lg">
          Your plan works at <b className={works.length === 25 ? "text-ok" : works.length >= 13 ? "text-warn" : "text-fail"}>{works.length} of 25</b> spots
          {" "}and at <b>{nearWorks} of {near.length}</b> spots within 1 km of where you plan to land.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={tryLanding}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            <ArrowDownToLine size={15} /> Try a landing
          </button>
          {drops.length > 0 && (
            <button type="button" onClick={() => setDrops([])} className="rounded-full border border-line px-3 py-1.5 text-xs text-muted">
              Reset
            </button>
          )}
        </div>
        <p aria-live="polite" className="min-h-[3rem] text-sm">
          {lastSpot ? (
            <>
              Landing {drops.length}: touched down at <b>{where(last.dx, last.dy)}</b>,{" "}
              <b className={lastSpot.r.verdict === "ok" ? "text-ok" : lastSpot.r.verdict === "warn" ? "text-warn" : "text-fail"}>{outcome(lastSpot.r)}</b>.
              <br />
              <span className="text-muted">
                So far the mission survived {survived} of {drops.length} landings.
              </span>
            </>
          ) : (
            <span className="text-muted">Press "Try a landing" to drop the lander with a random miss of about 1 km, like a real landing can have.</span>
          )}
        </p>
        {here.r.verdict === "fail" && best.r.verdict !== "fail" && (
          <p className="text-muted">
            Your planned spot fails. The best nearby spot is <b className="text-text">{where(best.dx, best.dy)}</b> ({VERDICT_LABEL[best.r.verdict]},
            lowest battery {best.r.minSoc.toFixed(0)} kWh).{" "}
            <button type="button" onClick={() => go(best)} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
              Plan there
            </button>
          </p>
        )}
        {here.r.verdict !== "fail" && works.length < 25 && (
          <p className="text-muted">Red squares show where a small landing miss would end the mission. Aim for a spot surrounded by green.</p>
        )}
        <div className="flex flex-wrap gap-4 text-[11px] text-muted">
          <span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-ok/60" />{VERDICT_LABEL.ok}</span>
          <span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-warn/60" />{VERDICT_LABEL.warn}</span>
          <span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-fail/60" />{VERDICT_LABEL.fail}</span>
          <span>Dashed square = site centre. Ringed square = where you plan to land. Click a square to plan there.</span>
        </div>
      </div>
    </div>
  );
}
