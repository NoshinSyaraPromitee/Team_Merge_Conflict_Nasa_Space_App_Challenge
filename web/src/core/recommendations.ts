//Rule-based Mission Recommendations.
// Generates verified, actionable recommendations based on actual simulation results.
import { SITES } from "./sites";
import { simulate, findSmallestDelay, findBestSite } from "./simulate";
import type { MissionParams, SimResult, Verdict } from "./types";

export type RecommendationCategory = "date" | "site" | "battery" | "power" | "panel";

export type Recommendation = {
  id: string;
  category: RecommendationCategory;
  title: string;
  reason: string;
  improvement: string;
  changes: Partial<MissionParams>;
  result: SimResult;
};

export type MissionAdvice = {
  isSafe: boolean;
  verdict: Verdict;
  message: string;
  recommendations: Recommendation[];
};

/**
 * Generates verified recommendations for a mission plan.
 * Every recommendation is re-simulated to confirm it measurably improves the outcome.
 * Neither the input params nor baseResult are modified.
 */
export function getRecommendations(params: MissionParams, baseResult?: SimResult): MissionAdvice {
  const current = baseResult ?? simulate(params);
  const recommendations: Recommendation[] = [];

  //Safe missions (verdict === "ok")
  if (current.verdict === "ok") {
    // Proactive check: if battery reserve is close to margin or blackout is long,
    // we can suggest high-margin optimizations.
    const isCloseToReserve = current.minSoc < current.reserve * 1.5;

    if (isCloseToReserve && params.batteryKwh < 200) {
      const upgradeKwh = Math.min(200, params.batteryKwh + 20);
      const testParams: MissionParams = { ...params, batteryKwh: upgradeKwh };
      const testRes = simulate(testParams);
      if (testRes.minSoc > current.minSoc) {
        recommendations.push({
          id: "proactive-battery",
          category: "battery",
          title: "Add battery for extra safety",
          reason: `The battery gets as low as ${current.minSoc.toFixed(1)} kWh, close to the safe minimum of ${current.reserve.toFixed(1)} kWh. A bigger battery gives more room if a shadow lasts longer.`,
          improvement: `lowest battery goes from ${current.minSoc.toFixed(1)} to ${testRes.minSoc.toFixed(1)} kWh`,
          changes: { batteryKwh: upgradeKwh },
          result: testRes,
        });
      }
    }

    return {
      isSafe: true,
      verdict: "ok",
      message: `This plan works. The battery never goes below ${current.minSoc.toFixed(1)} kWh (safe minimum: ${current.reserve.toFixed(1)} kWh) and the lander can talk to Earth ${Math.round(current.earthOkPct * 100)}% of the time.`,
      recommendations,
    };
  }

  //  Failing or Warn missions 
  const day = Math.floor((current.failHour ?? 0) / 24) + 1;
  const failureReason =
    current.cause === "power"
      ? `On day ${day} the battery drops below the safe minimum (${current.reserve.toFixed(0)} kWh). The lander is in shadow, so the solar panels cannot recharge it.`
      : current.cause === "comm"
        ? `On day ${day} the lander gets less than the ${params.commHoursReq} h of Earth contact it needs per day. Hills block the view of Earth.`
        : `The plan only just works: the battery gets as low as ${current.minSoc.toFixed(1)} kWh, close to the safe minimum, or there is barely enough Earth contact.`;

  // 1. Landing date adjustment (timing fix)
  const delayFix = findSmallestDelay(params);
  if (delayFix && delayFix.result.verdict !== "fail") {
    const newDelay = params.delayH + delayFix.delayH;
    const testParams: MissionParams = { ...params, delayH: newDelay };
    const testRes = simulate(testParams);
    if (testRes.verdict !== "fail") {
      recommendations.push({
        id: "fix-delay",
        category: "date",
        title: "Land on a different day",
        reason: `Landing ${delayFix.delayH / 24} day(s) later moves the mission into a longer sunny period and avoids the worst shadows.`,
        improvement: `land ${delayFix.delayH / 24} day(s) later, lowest battery ${testRes.minSoc.toFixed(1)} kWh`,
        changes: { delayH: newDelay },
        result: testRes,
      });
    }
  }

  // 2. Alternative landing site (location fix)
  const siteFix = findBestSite(params);
  if (siteFix && siteFix.result.verdict !== "fail") {
    const testParams: MissionParams = { ...params, siteIdx: siteFix.siteIdx };
    const testRes = simulate(testParams);
    if (testRes.verdict !== "fail") {
      const siteName = SITES[siteFix.siteIdx].name;
      recommendations.push({
        id: "fix-site",
        category: "site",
        title: "Land at a different site",
        reason: `${siteName} gets more sunlight or a clearer view of Earth for this plan.`,
        improvement: `move to ${siteName}, Earth contact ${Math.round(testRes.earthOkPct * 100)}%, lowest battery ${testRes.minSoc.toFixed(1)} kWh`,
        changes: { siteIdx: siteFix.siteIdx },
        result: testRes,
      });
    }
  }

  // 3. Battery capacity increase (energy storage fix)
  if (params.batteryKwh < 200) {
    for (let extra = 20; extra <= 200 - params.batteryKwh; extra += 20) {
      const testKwh = params.batteryKwh + extra;
      const testParams: MissionParams = { ...params, batteryKwh: testKwh };
      const testRes = simulate(testParams);
      if (testRes.verdict !== "fail" || testRes.minSoc > current.minSoc + 10) {
        if (testRes.verdict !== "fail") {
          recommendations.push({
            id: "fix-battery",
            category: "battery",
            title: "Use a bigger battery",
            reason: `A bigger battery stores enough power to get through the shadow without dropping below the safe minimum (25% of the battery).`,
            improvement: `${testKwh} kWh (+${extra} kWh), lowest battery ${testRes.minSoc.toFixed(1)} kWh`,
            changes: { batteryKwh: testKwh },
            result: testRes,
          });
          break; // only smallest effective battery increase
        }
      }
    }
  }

  // 4. Power consumption reduction (load shedding fix)
  if (params.loadKw > 0.5) {
    for (let testLoad = Math.round((params.loadKw - 0.3) * 10) / 10; testLoad >= 0.5; testLoad = Math.round((testLoad - 0.3) * 10) / 10) {
      const testParams: MissionParams = { ...params, loadKw: testLoad };
      const testRes = simulate(testParams);
      if (testRes.verdict !== "fail") {
        recommendations.push({
          id: "fix-power",
          category: "power",
          title: "Use less power",
          reason: `Turning off instruments and heaters that are not essential makes the battery last longer in the dark.`,
          improvement: `from ${params.loadKw.toFixed(1)} kW to ${testLoad.toFixed(1)} kW, lowest battery ${testRes.minSoc.toFixed(1)} kWh`,
          changes: { loadKw: testLoad },
          result: testRes,
        });
        break; // least restrictive reduction
      }
    }
  }

  // 5. Improve solar panel efficiency (generation fix)
  if (params.panelEff < 0.45) {
    for (let testEff = Math.round((params.panelEff + 0.05) * 100) / 100; testEff <= 0.45; testEff = Math.round((testEff + 0.05) * 100) / 100) {
      const testParams: MissionParams = { ...params, panelEff: testEff };
      const testRes = simulate(testParams);
      if (testRes.verdict !== "fail") {
        recommendations.push({
          id: "fix-panel",
          category: "panel",
          title: "Use better solar panels",
          reason: `Better panels make more power in sunlight, so the battery refills faster.`,
          improvement: `panel efficiency from ${Math.round(params.panelEff * 100)}% to ${Math.round(testEff * 100)}%`,
          changes: { panelEff: testEff },
          result: testRes,
        });
        break;
      }
    }
  }

  return {
    isSafe: false,
    verdict: current.verdict,
    message: failureReason,
    recommendations,
  };
}

