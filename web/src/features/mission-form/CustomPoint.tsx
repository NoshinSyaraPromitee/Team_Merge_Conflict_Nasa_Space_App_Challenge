import { useState } from "react";
import { Crosshair, X } from "lucide-react";
import { SITES, SNAP_KM, findPoint, useMission, usingRealData, type PointMatch } from "@/core";
import { Button } from "@/ui";

// Custom landing point: type a latitude/longitude; the plan moves to the nearest computed grid point when one is close enough.
export function CustomPoint() {
  const point = useMission((s) => (s.params.point && s.params.point.siteIdx === s.params.siteIdx ? s.params.point : null));
  const patch = useMission((s) => s.patch);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [result, setResult] = useState<PointMatch | null>(null);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const r = findPoint(Number(lat), Number(lon));
    setResult(r);
    if (r.kind === "snapped") patch({ siteIdx: r.siteIdx, point: { siteIdx: r.siteIdx, dxKm: r.dxKm, dyKm: r.dyKm, label: r.label } });
  };

  const field = "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm num outline-none focus:border-accent";

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Crosshair size={14} className="text-accent-soft" /> Custom landing point
      </div>
      <form onSubmit={go} className="flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-[11px] text-muted">Latitude (south is negative)</span>
          <input inputMode="decimal" placeholder="-85.96" value={lat} onChange={(e) => setLat(e.target.value)} className={field} />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-[11px] text-muted">Longitude (east)</span>
          <input inputMode="decimal" placeholder="-2.27" value={lon} onChange={(e) => setLon(e.target.value)} className={field} />
        </label>
        <Button type="submit" size="sm" className="mb-0.5">
          Use
        </Button>
      </form>

      {point && (
        <div className="flex items-start justify-between gap-2 rounded-lg bg-accent/15 px-2.5 py-1.5 text-xs">
          <span>
            Planning at <b>{point.label}</b>
            {!usingRealData() && " (sample data: nearby points are only available with the real NASA data)"}
          </span>
          <button type="button" aria-label="Back to the site centre" onClick={() => { patch({ point: undefined }); setResult(null); }} className="rounded-full p-0.5 text-muted">
            <X size={14} />
          </button>
        </div>
      )}

      <div aria-live="polite" className="text-[11px] leading-relaxed text-muted">
        {result?.kind === "snapped" && (
          <>Using the closest point we have data for, {Math.round(result.distanceKm * 1000)} m away. Every panel now shows this point.</>
        )}
        {result?.kind === "far" && (
          <>
            <b className="text-warn">We don't have terrain data for this point yet.</b> The closest site with data is {SITES[result.siteIdx].name},{" "}
            {result.distanceKm.toFixed(1)} km away (we only have data within {SNAP_KM} km of each site). To add this point:
            put it in <code className="num">pipeline/sites.yaml</code> and run <code className="num">pipeline/run_all.bat</code>; it computes the
            hills around it from NASA LOLA data and where the Sun and Earth are every hour.
          </>
        )}
        {(result?.kind === "invalid" || result?.kind === "outside") && <span className="text-fail">{result.reason}</span>}
      </div>
    </div>
  );
}