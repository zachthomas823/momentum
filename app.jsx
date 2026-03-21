import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// CONSTANTS & DATA MODEL
// ============================================================
const TARGETS = {
  bachelorParty: { date: "2026-08-20", weight: 200, bodyFat: 15.5 },
  wedding: { date: "2026-09-05", weight: 196, bodyFat: 14 },
  startWeight: 208.6, startBodyFat: 17.9, startDate: "2026-03-06",
  weeklyPaceLbs: 0.5, height: 72, age: 28, // inches, years
};
const DIET = {
  1: { emoji: "🔥", name: "Dumpster Fire", color: "#ef476f", kcalDelta: [800,1200] },
  2: { emoji: "😬", name: "Meh", color: "#f26522", kcalDelta: [200,500] },
  3: { emoji: "😐", name: "Cruise Control", color: "#9aabb8", kcalDelta: [-200,200] },
  4: { emoji: "💪", name: "Dialed In", color: "#06d6a0", kcalDelta: [-500,-300] },
  5: { emoji: "🎯", name: "Sniper Mode", color: "#4fc3f7", kcalDelta: [-700,-500] },
};
const DRINKS = ["Beer", "Wine", "Liquor", "Cocktail"];
const CONF = { high: {icon:"🟢",label:"Well-established"}, mod: {icon:"🟡",label:"Evidence-supported"}, low: {icon:"🔴",label:"Plausible but uncertain"} };

// ============================================================
// DECISION-IMPACT ENGINE (Layer 1 + Layer 2)
// Pure functions — no side effects, portable to web app
// ============================================================
const Engine = {
  // Layer 1: Energy Balance
  bmr(weightLbs, heightIn, age) {
    const kg = weightLbs * 0.4536, cm = heightIn * 2.54;
    return 10 * kg + 6.25 * cm - 5 * age - 5; // Mifflin-St Jeor (male)
  },
  tdeeEstimate(bmr, stepsAvg) {
    // Simple activity multiplier from steps
    if (stepsAvg > 12000) return bmr * 1.55;
    if (stepsAvg > 8000) return bmr * 1.45;
    if (stepsAvg > 5000) return bmr * 1.35;
    return bmr * 1.25;
  },
  weeklyDeficit(tdee, dietScoreAvg) {
    // Rough kcal delta per day from diet quality
    const dietMap = { 1: 1000, 2: 350, 3: 0, 4: -400, 5: -600 };
    const dailyDelta = dietMap[Math.round(dietScoreAvg)] || 0;
    return (tdee - (tdee + dailyDelta)) * 7; // negative = deficit
  },
  projectedWeight(currentLbs, weeklyLossRate, weeksOut) {
    // Returns {center, low, high}
    const center = currentLbs - (weeklyLossRate * weeksOut);
    const uncertainty = 0.3 * weeksOut; // ±0.3 lbs per week of projection
    return { center: Math.max(center, 170), low: Math.max(center - uncertainty, 170), high: center + uncertainty };
  },

  // EMA smoothing for weight trend (Phase 4)
  ema(values, alpha = 0.15) {
    if (!values.length) return [];
    const result = [values[0]];
    for (let i = 1; i < values.length; i++) result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
    return result;
  },

  // Derive actual weekly loss rate from weight data
  derivedPace(days) {
    const wDays = days.filter(d => d.weight?.lbs);
    if (wDays.length < 2) return { rate: TARGETS.weeklyPaceLbs, source: "default", confidence: "low" };
    const smoothed = Engine.ema(wDays.map(d => d.weight.lbs));
    const first3 = smoothed.slice(0, Math.min(3, smoothed.length));
    const last3 = smoothed.slice(-Math.min(3, smoothed.length));
    const avgFirst = first3.reduce((a, b) => a + b, 0) / first3.length;
    const avgLast = last3.reduce((a, b) => a + b, 0) / last3.length;
    const daySpan = (new Date(wDays[wDays.length - 1].date) - new Date(wDays[0].date)) / 864e5;
    if (daySpan < 3) return { rate: TARGETS.weeklyPaceLbs, source: "default", confidence: "low" };
    const rate = (avgFirst - avgLast) / (daySpan / 7);
    return { rate: Math.max(-1, Math.min(rate, 3)), source: "derived", confidence: wDays.length >= 6 ? "high" : "mod", dataPoints: wDays.length };
  },

  // TDEE pipeline — connects BMR → steps → TDEE
  tdeePipeline(currentWeight, days) {
    const bmr = Engine.bmr(currentWeight, TARGETS.height, TARGETS.age);
    const stepDays = days.filter(d => d.activity?.steps);
    const avgSteps = stepDays.length ? stepDays.reduce((a, d) => a + d.activity.steps, 0) / stepDays.length : 7000;
    const tdee = Engine.tdeeEstimate(bmr, avgSteps);
    return { bmr, tdee, avgSteps: Math.round(avgSteps) };
  },

  // Milestone detection
  checkMilestones(currentWeight) {
    const milestones = [];
    const lost = TARGETS.startWeight - currentWeight;
    if (lost >= 3) milestones.push({ icon: "📉", label: `${lost.toFixed(1)} lbs down from start` });
    if (lost >= 5) milestones.push({ icon: "🔥", label: "5+ lbs down" });
    if (lost >= 10) milestones.push({ icon: "🔟", label: "Double digits down" });
    if (currentWeight <= 205) milestones.push({ icon: "⚡", label: "Broke 205" });
    if (currentWeight <= 202.6) milestones.push({ icon: "👑", label: "New all-time lean (beat Sep 2024)" });
    if (currentWeight <= TARGETS.bachelorParty.weight) milestones.push({ icon: "🎉", label: "Bachelor party weight — nailed it" });
    if (currentWeight <= TARGETS.wedding.weight) milestones.push({ icon: "💍", label: "Wedding weight achieved" });
    return milestones;
  },

  // Layer 2: Impact Modifiers
  alcoholImpact(drinkCount) {
    if (drinkCount === 0) return null;
    if (drinkCount <= 2) return {
      fatOxSuppression: [20, 40], fatOxDuration: "4-6 hrs",
      mpsImpact: "Likely minimal", mpsConf: "low",
      sleepImpact: "Mild REM reduction", recoveryHrs: [8, 16],
      kcalAdded: [200, 350], realFatGain: [0.02, 0.06],
      scaleImpact: [0.3, 0.8], scaleNote: "Mostly water retention",
      weeklyTrajectoryShift: [0.03, 0.08], trajectoryUnit: "lbs",
      duration: "~12 hrs", conf: "mod",
      summary: `${drinkCount} drinks — modest impact. Fat burning pauses for a few hours, slight sleep disruption. Back to baseline by tomorrow.`,
    };
    if (drinkCount <= 5) return {
      fatOxSuppression: [50, 70], fatOxDuration: "6-8 hrs",
      mpsImpact: "10-20% reduction", mpsConf: "low",
      sleepImpact: "Significant REM disruption", recoveryHrs: [24, 40],
      kcalAdded: [500, 900], realFatGain: [0.08, 0.18],
      scaleImpact: [1.0, 2.5], scaleNote: "Water + glycogen — resolves in 2-3 days",
      weeklyTrajectoryShift: [0.1, 0.25], trajectoryUnit: "lbs",
      duration: "24-36 hrs", conf: "mod",
      summary: `${drinkCount} drinks — noticeable impact. Fat burning halted for most of the evening, meaningful sleep disruption, elevated resting HR for 1-2 days. Recovery takes about 2 days of clean behavior.`,
    };
    return {
      fatOxSuppression: [73, 79], fatOxDuration: "8+ hrs",
      mpsImpact: "24-37% reduction (Parr et al.)", mpsConf: "high",
      sleepImpact: "Major architecture disruption", recoveryHrs: [48, 72],
      kcalAdded: [900, 1800], realFatGain: [0.2, 0.45],
      scaleImpact: [2, 5], scaleNote: "Water + glycogen + inflammation — 3-5 day recovery",
      weeklyTrajectoryShift: [0.3, 0.55], trajectoryUnit: "lbs",
      duration: "48-72 hrs", conf: "high",
      summary: `${drinkCount} drinks — significant impact. Fat oxidation suppressed ~75% for 8+ hours, muscle protein synthesis reduced by a quarter to a third, sleep architecture disrupted. Full recovery takes 3-5 days. This is the pattern that stalled progress Aug-Sep 2025.`,
    };
  },

  sleepImpact(hours) {
    if (hours >= 8) return {
      fatRatio: [50, 60], kcalIncrease: 0, mpsImpact: "Baseline",
      summary: `${hours.toFixed(1)}h sleep — optimal. Weight loss during deficit is ~56% fat. Recovery and hormone profile at their best.`,
      conf: "high", good: true,
    };
    if (hours >= 7) return {
      fatRatio: [40, 50], kcalIncrease: [100, 200], mpsImpact: "Modest reduction",
      summary: `${hours.toFixed(1)}h sleep — adequate but not optimal. Slightly more hunger tomorrow, fat-to-muscle loss ratio shifts a bit unfavorably.`,
      conf: "mod", good: null,
    };
    if (hours >= 5.5) return {
      fatRatio: [20, 35], kcalIncrease: [300, 450], mpsImpact: "-18% MPS",
      summary: `${hours.toFixed(1)}h sleep — this hurts. Research shows weight loss at this duration is only ~25% fat vs ~56% at 8+ hours. Expect +300-450 kcal of hunger-driven eating tomorrow. Muscle protein synthesis drops ~18%.`,
      conf: "high", good: false,
    };
    return {
      fatRatio: [10, 25], kcalIncrease: [400, 600], mpsImpact: "Significant reduction",
      summary: `${hours.toFixed(1)}h sleep — rough night. The body shifts hard toward muscle breakdown during deficit, hunger hormones spike, insulin sensitivity drops measurably. One night is recoverable; this pattern chronically is the biggest silent progress killer.`,
      conf: "mod", good: false,
    };
  },

  exerciseImpact(type, durationMin) {
    const kcalPerMin = type === "strength" ? 6.5 : type === "run" ? 10 : 4;
    const kcal = [Math.round(kcalPerMin * durationMin * 0.8), Math.round(kcalPerMin * durationMin * 1.2)];
    const epoc = type === "strength" ? [30, 60] : [15, 30];
    return {
      kcalBurned: kcal, epoc, mpsBoost: type === "strength" ? "Elevated 24-36 hrs" : "Minimal",
      weeklyTrajectoryShift: [-(kcal[0] + epoc[0]) / 3500, -(kcal[1] + epoc[1]) / 3500],
      summary: type === "strength"
        ? `${durationMin} min strength session — burned roughly ${kcal[0]}-${kcal[1]} kcal plus ${epoc[0]}-${epoc[1]} kcal afterburn. Muscle protein synthesis elevated for 24-36 hours. This is the highest-leverage activity for recomp.`
        : `${durationMin} min ${type} — burned roughly ${kcal[0]}-${kcal[1]} kcal. Good for deficit, modest afterburn.`,
      conf: type === "strength" ? "high" : "high",
      good: true,
    };
  },

  dietImpact(score) {
    const d = DIET[score];
    if (!d) return null;
    return {
      kcalDelta: d.kcalDelta,
      weeklyTrajectoryShift: [d.kcalDelta[0] / 3500, d.kcalDelta[1] / 3500],
      summary: score >= 4
        ? `${d.name} day — you're in deficit. Every day like this compounds. At this pace the trajectory steepens.`
        : score === 3
        ? `${d.name} — maintenance zone. Not gaining, not losing. Fine occasionally, but too many of these flatten the trajectory.`
        : `${d.name} day — surplus territory. The actual fat impact of one day is small (${(Math.abs(d.kcalDelta[0])/3500).toFixed(2)}-${(Math.abs(d.kcalDelta[1])/3500).toFixed(2)} lbs), but the scale will overreact with water/glycogen. Recoverable in 2-3 clean days.`,
      conf: "high", good: score >= 4 ? true : score <= 2 ? false : null,
    };
  },

  // Scenario Impact — narrative output, no point estimates
  scenarioImpact(scenario) {
    const effects = [];
    let totalWeeklyShift = [0, 0]; // [low, high] lbs/week impact
    const addShift = (lo, hi) => { totalWeeklyShift[0] += lo; totalWeeklyShift[1] += hi; };

    if (scenario.alcohol) {
      const a = Engine.alcoholImpact(scenario.alcohol);
      if (a) {
        effects.push({ ...a, category: "alcohol" });
        addShift(a.weeklyTrajectoryShift[0], a.weeklyTrajectoryShift[1]);
      }
    }
    if (scenario.sleep) {
      const sl = Engine.sleepImpact(scenario.sleep);
      effects.push({ ...sl, category: "sleep" });
      const ki = sl.kcalIncrease;
      const avg = Array.isArray(ki) ? [(ki[0])/3500, (ki[1])/3500] : [0, 0];
      addShift(avg[0], avg[1]);
    }
    if (scenario.diet) {
      const d = Engine.dietImpact(scenario.diet);
      if (d) {
        effects.push({ ...d, category: "diet" });
        addShift(d.weeklyTrajectoryShift[0], d.weeklyTrajectoryShift[1]);
      }
    }
    if (scenario.exercise) {
      const e = Engine.exerciseImpact(scenario.exercise.type, scenario.exercise.duration);
      effects.push({ ...e, category: "exercise" });
      addShift(e.weeklyTrajectoryShift[0], e.weeklyTrajectoryShift[1]);
    }

    // Classify the overall direction
    const avgShift = (totalWeeklyShift[0] + totalWeeklyShift[1]) / 2;
    let direction, severity;
    if (avgShift <= -0.15) { direction = "accelerates"; severity = "meaningfully"; }
    else if (avgShift <= -0.05) { direction = "helps"; severity = "modestly"; }
    else if (avgShift <= 0.05) { direction = "neutral"; severity = ""; }
    else if (avgShift <= 0.15) { direction = "slows"; severity = "modestly"; }
    else if (avgShift <= 0.3) { direction = "slows"; severity = "noticeably"; }
    else { direction = "stalls"; severity = "significantly"; }

    // Convert to "clean days equivalent" for relatability
    const cleanDayValue = 0.07; // ~0.07 lbs/day in deficit on a Dialed In day
    const daysEquiv = [
      Math.abs(totalWeeklyShift[0] / cleanDayValue),
      Math.abs(totalWeeklyShift[1] / cleanDayValue),
    ];

    return {
      effects,
      totalWeeklyShift,
      direction,
      severity,
      daysEquiv,
      isPositive: avgShift < -0.02,
      isNegative: avgShift > 0.05,
    };
  },

  compareNarrative(scenarioA, scenarioB, labels) {
    const impA = Engine.scenarioImpact(scenarioA);
    const impB = Engine.scenarioImpact(scenarioB);
    return { a: impA, b: impB, labelA: labels?.[0] || "Option A", labelB: labels?.[1] || "Option B" };
  },
};

// ============================================================
// PATTERN DETECTION (Phase 3)
// Pure functions — analyzes stored day records for behavioral patterns
// ============================================================
const Patterns = {
  detectAll(days) {
    const nudges = [];
    if (!days || days.length < 3) return nudges;

    // 1. Weekend alcohol pattern
    const byDow = {};
    days.forEach(d => {
      const dow = new Date(d.date + "T12:00:00").getDay();
      if (!byDow[dow]) byDow[dow] = [];
      if (d.alcohol?.totalDrinks > 0) byDow[dow].push(d.alcohol.totalDrinks);
    });
    const wkendDrinks = [...(byDow[5]||[]), ...(byDow[6]||[]), ...(byDow[0]||[])];
    const wkdayDrinks = [1,2,3,4].flatMap(d => byDow[d]||[]);
    if (wkendDrinks.length > 0 && wkendDrinks.reduce((a,b)=>a+b,0) > wkdayDrinks.reduce((a,b)=>a+b,0) * 1.5) {
      nudges.push({ type: "warning", icon: "🍺", title: "Weekend pattern detected", body: "Most of your drinks land on weekends. This is the exact pattern that stalled Aug-Sep 2025 — weekday discipline erased by weekend recovery.", priority: 1 });
    }

    // 2. Training frequency
    const last7 = days.slice(-7);
    const sessions = last7.filter(d => d.activity?.strengthSession).length;
    if (sessions === 0) {
      nudges.push({ type: "alert", icon: "🏋️", title: "No strength sessions this week", body: "Target is 3x/week. Strength training is the highest-leverage move for the visual recomp you want.", priority: 2 });
    } else if (sessions < 3) {
      nudges.push({ type: "nudge", icon: "🏋️", title: `${sessions}/3 strength sessions`, body: `${3-sessions} more this week to hit target. Every session builds the lean mass that makes 200 lbs look built, not just lighter.`, priority: 3 });
    }

    // 3. Diet weekday vs weekend
    const dietDays = days.filter(d => d.diet?.score);
    if (dietDays.length >= 5) {
      const wkdayDiet = dietDays.filter(d => { const dow = new Date(d.date+"T12:00:00").getDay(); return dow >= 1 && dow <= 5; });
      const wkendDiet = dietDays.filter(d => { const dow = new Date(d.date+"T12:00:00").getDay(); return dow === 0 || dow === 6; });
      const wkdayAvg = wkdayDiet.length ? wkdayDiet.reduce((a,d)=>a+d.diet.score,0)/wkdayDiet.length : 0;
      const wkendAvg = wkendDiet.length ? wkendDiet.reduce((a,d)=>a+d.diet.score,0)/wkendDiet.length : 0;
      if (wkdayAvg >= 3.5 && wkendAvg < 2.5 && wkendDiet.length >= 1) {
        nudges.push({ type: "warning", icon: "🍔", title: "Weekend diet drop-off", body: `Weekday average: ${wkdayAvg.toFixed(1)} (solid). Weekend average: ${wkendAvg.toFixed(1)} (undoing it). One Friday decision sets the weekend tone.`, priority: 2 });
      }
    }

    // 4. Sleep trend
    const sleepDays = days.filter(d => d.sleep?.hours).slice(-7);
    if (sleepDays.length >= 3) {
      const avg = sleepDays.reduce((a,d)=>a+d.sleep.hours,0)/sleepDays.length;
      const subSeven = sleepDays.filter(d => d.sleep.hours < 7).length;
      if (avg < 7) {
        nudges.push({ type: "warning", icon: "😴", title: `Sleep averaging ${avg.toFixed(1)}h`, body: "Under 7h means weight loss shifts from 56% fat to ~35% fat. You're losing the same weight but more of it is muscle.", priority: 2 });
      } else if (subSeven >= 2) {
        nudges.push({ type: "nudge", icon: "😴", title: `${subSeven} nights under 7h this week`, body: "Mostly good, but those short nights spike hunger hormones the next day. The cascade compounds.", priority: 4 });
      }
    }

    // 5. Weight trend
    const weightDays = days.filter(d => d.weight?.lbs).slice(-14);
    if (weightDays.length >= 3) {
      const first = weightDays.slice(0,3).reduce((a,d)=>a+d.weight.lbs,0)/3;
      const last = weightDays.slice(-3).reduce((a,d)=>a+d.weight.lbs,0)/3;
      const weeksDiff = (new Date(weightDays[weightDays.length-1].date) - new Date(weightDays[0].date)) / (7*864e5);
      const rate = weeksDiff > 0 ? (first - last) / weeksDiff : 0;
      if (rate > 0.7) {
        nudges.push({ type: "positive", icon: "🔥", title: "Pace ahead of target", body: `Trending ~${rate.toFixed(1)} lbs/week — faster than the 0.5 target. If this feels sustainable, ride it. If you're grinding, ease up slightly.`, priority: 3 });
      } else if (rate > 0.3) {
        nudges.push({ type: "positive", icon: "📈", title: "On pace", body: `Trending ~${rate.toFixed(1)} lbs/week. This is the sustainable rate that worked Oct-Nov 2025. Keep doing exactly what you're doing.`, priority: 5 });
      } else if (rate < 0.1 && weeksDiff >= 1.5) {
        nudges.push({ type: "alert", icon: "📊", title: "Trend is flat", body: "Weight hasn't moved meaningfully in ~" + Math.round(weeksDiff) + " weeks. Check if something changed — the Aug-Sep 2025 plateau looked like this.", priority: 1 });
      }
    }

    // 6. Logging streak
    const last14 = days.slice(-14);
    const loggedDays = last14.filter(d => d.diet || d.alcohol || d.weight || d.sleep || d.activity).length;
    const unloggedStreak = (() => { let s=0; for(let i=last7.length-1;i>=0;i--) { if (!last7[i].diet && !last7[i].alcohol && !last7[i].weight && !last7[i].sleep && !last7[i].activity) s++; else break; } return s; })();
    if (unloggedStreak >= 3) {
      nudges.push({ type: "alert", icon: "📵", title: `${unloggedStreak} days with no logs`, body: "Logging gaps are the #1 risk. The 8-month gap in 2024-25 is where 12 lbs came from. 30 seconds a day keeps the trajectory visible.", priority: 0 });
    } else if (loggedDays >= 12) {
      nudges.push({ type: "positive", icon: "🔗", title: `${loggedDays}/14 days logged`, body: "Consistency is the foundation everything else is built on. This is exactly the pattern that drives results.", priority: 5 });
    }

    // 7. Dry streak
    const dryStreak = (() => { let s=0; for(let i=days.length-1;i>=0;i--) { if (days[i].alcohol?.dry || (days[i].alcohol && days[i].alcohol.totalDrinks === 0)) s++; else if (days[i].alcohol?.totalDrinks > 0) break; else continue; } return s; })();
    if (dryStreak >= 5) {
      nudges.push({ type: "positive", icon: "✨", title: `${dryStreak}-day dry streak`, body: "This is the move. Oct-Nov 2025 proved it — dry streaks are the single highest-leverage pattern in your data.", priority: 2 });
    }

    // 8. Plateau detection (Phase 4) — uses EMA to detect flatlining
    const wAll = days.filter(d => d.weight?.lbs);
    if (wAll.length >= 4) {
      const smoothed = Engine.ema(wAll.map(d => d.weight.lbs));
      const recent = smoothed.slice(-4);
      const range = Math.max(...recent) - Math.min(...recent);
      const daysBetween = (new Date(wAll[wAll.length-1].date) - new Date(wAll[Math.max(0,wAll.length-4)].date)) / 864e5;
      if (range < 1.0 && daysBetween >= 7) {
        nudges.push({ type: "warning", icon: "📊", title: "Possible plateau", body: `Weight has stayed within ${range.toFixed(1)} lbs over the last ${Math.round(daysBetween)} days. The Aug-Sep 2025 plateau looked exactly like this. Check what changed — usually it's weekend patterns compounding.`, priority: 1 });
      }
    }

    return nudges.sort((a,b) => a.priority - b.priority);
  }
};

// ============================================================
// STORAGE ABSTRACTION
// ============================================================
const S = {
  async get(k) { try { if (!window.storage) return null; const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } },
  async set(k, v) { try { if (!window.storage) return; await window.storage.set(k, JSON.stringify(v)); } catch {} },
  async list(p) { try { if (!window.storage) return []; const r = await window.storage.list(p); return r?.keys || []; } catch { return []; } },
};
// ============================================================
// DATA INGESTION LAYER
// Abstraction: accepts normalized snapshots from any source.
// POC: Claude pulls Health Connect → calls Ingest.syncFromSnapshot()
// Web app: Fitbit API response → same Ingest.syncFromSnapshot()
// ============================================================
const Ingest = {
  // Write a normalized daily snapshot to storage
  // shape: { date, weight?, sleep?, activity?, steps? }
  async syncDay(day) {
    if (!day?.date) return;
    if (day.weight) await S.set(`weight:${day.date}`, { ...day.weight, date: day.date, source: "health_connect" });
    if (day.sleep) await S.set(`sleep:${day.date}`, { ...day.sleep, date: day.date, source: "health_connect" });
    if (day.activity) {
      const existing = await S.get(`activity:${day.date}`);
      // Merge: don't overwrite manual logs, but add device data
      await S.set(`activity:${day.date}`, { ...(existing || {}), ...day.activity, date: day.date, source: "health_connect" });
    }
  },

  // Bulk sync from a full snapshot array
  async syncFromSnapshot(days) {
    for (const day of days) {
      await Ingest.syncDay(day);
    }
    await S.set("last-sync", { timestamp: Date.now(), source: "health_connect", daysCount: days.length });
  },
};

// --- Pre-loaded Health Connect snapshot (pulled Mar 8, 2026) ---
// This is the bridge: Claude pulls from HC tools, writes here, artifact reads from storage.
// In web app: replace this with Fitbit API fetch → same Ingest.syncFromSnapshot() call.
const HC_SNAPSHOT = [
  {date:"2026-02-22",sleep:{hours:7.97},activity:{steps:10724}},
  {date:"2026-02-23",sleep:{hours:7.07},activity:{steps:13082,run:true,runDuration:24}},
  {date:"2026-02-24",sleep:{hours:6.48},activity:{steps:15759}},
  {date:"2026-02-25",sleep:{hours:7.92},activity:{steps:12768}},
  {date:"2026-02-26",sleep:{hours:6.65},activity:{steps:17351}},
  {date:"2026-02-27",sleep:{hours:6.47},activity:{steps:27551}},
  {date:"2026-02-28",sleep:{hours:5.45},activity:{steps:29528,run:true,runDuration:27}},
  {date:"2026-03-01",sleep:{hours:8.77},activity:{steps:12522}},
  {date:"2026-03-02",sleep:{hours:8.20},activity:{steps:12028}},
  {date:"2026-03-03",sleep:{hours:6.83},activity:{steps:18891,run:true,runDuration:18}},
  {date:"2026-03-04",sleep:{hours:6.82},activity:{steps:13497,strengthSession:true,duration:74}},
  {date:"2026-03-05",sleep:{hours:6.42},activity:{steps:18127}},
  {date:"2026-03-06",sleep:{hours:5.68},activity:{steps:10048},weight:{lbs:208.6,bodyFat:17.9}},
  {date:"2026-03-07",sleep:{hours:7.28},activity:{steps:8616}},
  {date:"2026-03-08",sleep:{hours:7.28},activity:{steps:10721},weight:{lbs:205.7,bodyFat:17.6}},
];

function today() { return new Date().toISOString().split("T")[0]; }
function daysTo(d) { const t = new Date(d+"T00:00:00"), n = new Date(); n.setHours(0,0,0,0); return Math.ceil((t-n)/(864e5)); }
function fmtDate(d) { return new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}); }

async function loadState() {
  let config = null, model = null;
  try { config = await S.get("config"); } catch {}
  try { model = await S.get("model-state"); } catch {}
  const days = [];
  for (let i = 14; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate()-i); days.push(d.toISOString().split("T")[0]); }
  const data = [];
  for (const date of days) {
    let w=null,d=null,a=null,sl=null,ac=null;
    try{w=await S.get(`weight:${date}`);}catch{}
    try{d=await S.get(`diet:${date}`);}catch{}
    try{a=await S.get(`alcohol:${date}`);}catch{}
    try{sl=await S.get(`sleep:${date}`);}catch{}
    try{ac=await S.get(`activity:${date}`);}catch{}
    data.push({date,weight:w,diet:d,alcohol:a,sleep:sl,activity:ac});
  }
  return {config:config||{},model:model||{},days:data};
}

// ============================================================
// GLOBAL STYLES
// ============================================================
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#0d1117;--card:#1a2235;--raised:#1f2d45;--amber:#f5a623;--coral:#f26522;--gold:#ffd166;--teal:#06d6a0;--sky:#4fc3f7;--rose:#ef476f;--lav:#9b5de5;--t1:#f0e6d3;--t2:#9aabb8;--t3:#5e6a7a;--r:16px;--font-d:'Outfit',sans-serif;--font-b:'DM Sans',sans-serif;}
body{background:var(--bg);color:var(--t1);font-family:var(--font-b);}
input,textarea{font-family:var(--font-b);}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes glow{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes slideDown{from{opacity:0;max-height:0}to{opacity:1;max-height:500px}}
`;

// ============================================================
// REUSABLE COMPONENTS
// ============================================================
const Card = ({children,style,glow,onClick}) => (
  <div onClick={onClick} style={{background:"var(--card)",borderRadius:"var(--r)",border:"1px solid rgba(255,255,255,0.06)",padding:16,position:"relative",overflow:"hidden",...(glow?{boxShadow:`0 0 20px ${glow}22, 0 0 40px ${glow}08`}:{}),cursor:onClick?"pointer":"default",...style}}>
    <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,255,255,0.03) 0%,transparent 60%)",pointerEvents:"none"}}/>
    <div style={{position:"relative"}}>{children}</div>
  </div>
);
const Pill = ({children,color="var(--amber)"}) => <span style={{display:"inline-block",fontFamily:"var(--font-b)",fontWeight:800,fontSize:11,borderRadius:40,padding:"3px 12px",textTransform:"uppercase",letterSpacing:"0.08em",background:`${color}22`,color,border:`1px solid ${color}44`}}>{children}</span>;
const Btn = ({children,onClick,color="var(--amber)",disabled,full,style:s}) => <button onClick={onClick} disabled={disabled} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"var(--font-b)",fontWeight:800,fontSize:14,border:"none",cursor:disabled?"default":"pointer",borderRadius:40,padding:"12px 24px",background:color,color:"#1a1000",boxShadow:`0 0 14px ${color}33`,opacity:disabled?0.4:1,transition:"transform 0.15s,box-shadow 0.15s",...(full?{width:"100%"}:{}),...s}}>{children}</button>;
const Label = ({children}) => <span style={{fontFamily:"var(--font-b)",fontWeight:800,fontSize:11,textTransform:"uppercase",letterSpacing:"0.12em",color:"var(--t2)"}}>{children}</span>;

function ConfBadge({level}) {
  const c = CONF[level]; if(!c) return null;
  return <span style={{fontSize:11,fontWeight:600,color:"var(--t3)"}}>{c.icon} {c.label}</span>;
}

function ImpactDetail({impact}) {
  if(!impact) return null;
  return (
    <div style={{animation:"slideDown 0.3s ease",overflow:"hidden",marginTop:8,padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.04)"}}>
      <div style={{fontSize:13,color:"var(--t1)",lineHeight:1.7,marginBottom:8}}>{impact.summary}</div>
      {impact.weeklyTrajectoryShift && (
        <div style={{fontSize:12,color:"var(--amber)",fontWeight:700,marginBottom:6}}>
          Trajectory shift: {impact.weeklyTrajectoryShift[0]>0?"+":""}{(impact.weeklyTrajectoryShift[0]*7).toFixed(2)} to {impact.weeklyTrajectoryShift[1]>0?"+":""}{(impact.weeklyTrajectoryShift[1]*7).toFixed(2)} lbs/week
        </div>
      )}
      {impact.kcalAdded && <div style={{fontSize:11,color:"var(--t2)"}}>Caloric impact: +{impact.kcalAdded[0]}–{impact.kcalAdded[1]} kcal</div>}
      {impact.kcalBurned && <div style={{fontSize:11,color:"var(--t2)"}}>Calories burned: {impact.kcalBurned[0]}–{impact.kcalBurned[1]} kcal</div>}
      {impact.kcalDelta && <div style={{fontSize:11,color:"var(--t2)"}}>Daily balance: {impact.kcalDelta[0]>0?"+":""}{impact.kcalDelta[0]} to {impact.kcalDelta[1]>0?"+":""}{impact.kcalDelta[1]} kcal</div>}
      {impact.scaleImpact && <div style={{fontSize:11,color:"var(--t2)",marginTop:4}}>Scale impact: +{impact.scaleImpact[0]}–{impact.scaleImpact[1]} lbs ({impact.scaleNote})</div>}
      {impact.duration && <div style={{fontSize:11,color:"var(--t2)"}}>Recovery: {impact.duration}</div>}
      <div style={{marginTop:6}}><ConfBadge level={impact.conf} /></div>
    </div>
  );
}

// ============================================================
// TRAJECTORY TIMELINE (Interactive Phase 2)
// ============================================================
function Arrow({good, size=20}) {
  const color = good === true ? "#06d6a0" : good === false ? "#ef476f" : "#9aabb8";
  const glow = good === true ? "rgba(6,214,160,0.3)" : good === false ? "rgba(239,71,111,0.3)" : "rgba(154,171,184,0.15)";
  return (
    <div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",filter:`drop-shadow(0 0 6px ${glow})`,transform:`rotate(${good===false?180:0}deg)`,transition:"transform 0.3s ease"}}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 4L12 20M12 4L6 10M12 4L18 10" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  );
}

function EventCard({event, onTap, expanded}) {
  const color = event.good === true ? "#06d6a0" : event.good === false ? "#ef476f" : "#9aabb8";
  const bg = event.good === true ? "rgba(6,214,160,0.08)" : event.good === false ? "rgba(239,71,111,0.08)" : "rgba(154,171,184,0.05)";
  return (
    <div onClick={()=>onTap&&onTap(event)} style={{cursor:"pointer",marginBottom:4,minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:10,background:bg,border:expanded?`1.5px solid ${color}`:`1px solid ${color}33`,transition:"all 0.2s"}}>
        <Arrow good={event.good} size={16} />
        <span style={{fontSize:11,fontWeight:600,color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{event.label}</span>
        {event.impact && <span style={{fontSize:9,color:"var(--t3)",flexShrink:0}}>{expanded?"▾":"▸"}</span>}
      </div>
      {expanded && event.impact && <ImpactDetail impact={event.impact} />}
    </div>
  );
}

function buildEventsFromData(days) {
  return days.map((d,i) => {
    const events = [];
    if(d.diet?.score) {
      const imp = Engine.dietImpact(d.diet.score);
      events.push({type:"diet",label:DIET[d.diet.score]?.name||"Logged",good:imp?.good,impact:imp});
    } else if(d.diet?.mode==="meals") {
      events.push({type:"diet",label:"Meals logged",good:null,impact:null});
    }
    if(d.alcohol?.totalDrinks > 0) {
      const imp = Engine.alcoholImpact(d.alcohol.totalDrinks);
      events.push({type:"alcohol",label:`${d.alcohol.totalDrinks} drink${d.alcohol.totalDrinks>1?"s":""}`,good:false,impact:imp});
    } else if(d.alcohol?.dry) {
      events.push({type:"alcohol",label:"Dry day ✨",good:true,impact:{summary:"No alcohol — fat oxidation unimpeded, sleep architecture intact, recovery optimal. Every dry day compounds.",conf:"high",weeklyTrajectoryShift:[-0.02,-0.05]}});
    }
    if(d.sleep?.hours) {
      const imp = Engine.sleepImpact(d.sleep.hours);
      events.push({type:"sleep",label:`${d.sleep.hours.toFixed(1)}h sleep`,good:imp.good,impact:imp});
    }
    if(d.activity?.strengthSession) {
      const dur = d.activity.duration || 45;
      const imp = Engine.exerciseImpact("strength", dur);
      events.push({type:"gym",label:`Gym — ${dur} min`,good:true,impact:imp});
    }
    if(d.activity?.run) {
      const dur = d.activity.runDuration || 30;
      const imp = Engine.exerciseImpact("run", dur);
      events.push({type:"run",label:`Run — ${dur} min`,good:true,impact:imp});
    }
    return {day:i, date:d.date, events};
  });
}

function Trajectory({windowDays=7, days=[], onEventTap, expandedEvent}) {
  const scrollRef = useRef(null);
  const canvasRef = useRef(null);
  const DAY_WIDTH = 130;
  const totalW = DAY_WIDTH * (windowDays + 3);
  const H = 280;
  const eventData = buildEventsFromData(days.slice(-windowDays));
  // pad with empty future days
  for(let i=0;i<3;i++) eventData.push({day:windowDays+i,date:"future",events:[]});

  const dayLabels = [];
  for(let i=0;i<windowDays+3;i++){
    const d=new Date();d.setDate(d.getDate()-windowDays+1+i);
    dayLabels.push({date:d.toISOString().split("T")[0],label:d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}),isToday:i===windowDays-1,isFuture:i>=windowDays,dayIndex:i});
  }

  useEffect(()=>{
    const c=canvasRef.current;if(!c)return;
    const dpr=window.devicePixelRatio||1;c.width=totalW*dpr;c.height=H*dpr;
    const ctx=c.getContext("2d");ctx.scale(dpr,dpr);

    // Dot grid
    ctx.fillStyle="rgba(255,255,255,0.02)";
    for(let x=15;x<totalW;x+=28)for(let y=15;y<H;y+=28){ctx.beginPath();ctx.arc(x,y,0.7,0,Math.PI*2);ctx.fill();}

    const pad={t:20,b:40},plotH=H-pad.t-pad.b;
    const nowFrac=(windowDays-1)/(windowDays+2);

    // Collect weight data for y-axis scaling
    const pastDays = days.slice(-windowDays);
    const weightPts = [];
    pastDays.forEach((d,i)=>{if(d.weight?.lbs)weightPts.push({x:i*DAY_WIDTH+DAY_WIDTH/2,lbs:d.weight.lbs,idx:i});});

    // Y-axis range from data or defaults
    const allWeights = weightPts.map(p=>p.lbs);
    const wMax = allWeights.length ? Math.max(...allWeights)+2 : TARGETS.startWeight+2;
    const wMin = allWeights.length ? Math.min(Math.min(...allWeights)-2, TARGETS.bachelorParty.weight-1) : TARGETS.bachelorParty.weight-2;
    const yScale = (lbs) => pad.t + plotH * (1 - (lbs-wMin)/(wMax-wMin));

    // Projection band (future days)
    const pace = Engine.derivedPace(days);
    const lastW = allWeights.length ? allWeights[allWeights.length-1] : TARGETS.startWeight;
    const futureStart = windowDays * DAY_WIDTH;

    // Draw gradient band behind everything
    const bandGrad=ctx.createLinearGradient(0,0,totalW,0);
    bandGrad.addColorStop(0,"rgba(245,166,35,0.15)");
    bandGrad.addColorStop(nowFrac,"rgba(245,166,35,0.12)");
    bandGrad.addColorStop(Math.min(1,nowFrac+0.1),"rgba(6,214,160,0.08)");
    bandGrad.addColorStop(1,"rgba(6,214,160,0.03)");

    // Projection cone
    for(let i=0;i<3;i++){
      const dayOff = i+1;
      const projW = lastW - pace.rate * (dayOff/7);
      const unc = 0.4 * dayOff;
      const cx = futureStart + i*DAY_WIDTH + DAY_WIDTH/2;
      const yHi = yScale(projW+unc);
      const yLo = yScale(projW-unc);
      ctx.fillStyle = `rgba(6,214,160,${0.06-i*0.015})`;
      ctx.beginPath(); ctx.ellipse(cx,(yHi+yLo)/2,DAY_WIDTH*0.4,(yLo-yHi)/2,0,0,Math.PI*2); ctx.fill();
    }

    // Target line
    if(TARGETS.bachelorParty.weight >= wMin && TARGETS.bachelorParty.weight <= wMax){
      const ty = yScale(TARGETS.bachelorParty.weight);
      ctx.save();ctx.setLineDash([4,6]);ctx.strokeStyle="rgba(6,214,160,0.25)";ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(0,ty);ctx.lineTo(totalW,ty);ctx.stroke();ctx.restore();
      ctx.fillStyle="rgba(6,214,160,0.4)";ctx.font="bold 9px 'DM Sans',sans-serif";ctx.textAlign="left";
      ctx.fillText(`${TARGETS.bachelorParty.weight} target`,8,ty-5);
    }

    // Day separator lines
    for(let i=0;i<dayLabels.length;i++){
      const x=i*DAY_WIDTH+DAY_WIDTH/2;
      ctx.beginPath();ctx.strokeStyle=dayLabels[i].isToday?"rgba(245,166,35,0.3)":"rgba(255,255,255,0.03)";
      ctx.lineWidth=dayLabels[i].isToday?1.5:0.5;
      if(dayLabels[i].isToday)ctx.setLineDash([5,5]);
      ctx.moveTo(x,pad.t);ctx.lineTo(x,H-pad.b);ctx.stroke();ctx.setLineDash([]);
    }

    // EMA trend line (if 2+ weight points)
    if(weightPts.length>=2){
      const smoothed = Engine.ema(weightPts.map(p=>p.lbs));
      ctx.beginPath();ctx.strokeStyle="rgba(245,166,35,0.6)";ctx.lineWidth=2.5;ctx.lineJoin="round";ctx.lineCap="round";
      weightPts.forEach((p,i)=>{const y=yScale(smoothed[i]);i===0?ctx.moveTo(p.x,y):ctx.lineTo(p.x,y);});
      // Extend trend into future
      const trendEnd = smoothed[smoothed.length-1];
      for(let i=1;i<=3;i++){
        const px = futureStart+(i-1)*DAY_WIDTH+DAY_WIDTH/2;
        const pw = trendEnd - pace.rate*(i/7);
        ctx.lineTo(px, yScale(pw));
      }
      ctx.stroke();
      // Dashed for the projected portion
      ctx.beginPath();ctx.setLineDash([6,4]);ctx.strokeStyle="rgba(6,214,160,0.35)";ctx.lineWidth=2;
      ctx.moveTo(weightPts[weightPts.length-1].x, yScale(trendEnd));
      for(let i=1;i<=3;i++){
        ctx.lineTo(futureStart+(i-1)*DAY_WIDTH+DAY_WIDTH/2, yScale(trendEnd - pace.rate*(i/7)));
      }
      ctx.stroke();ctx.setLineDash([]);
    }

    // Raw weight dots
    weightPts.forEach(p=>{
      const y=yScale(p.lbs);
      // Glow
      const g=ctx.createRadialGradient(p.x,y,0,p.x,y,12);
      g.addColorStop(0,"rgba(245,166,35,0.25)");g.addColorStop(1,"rgba(245,166,35,0)");
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,y,12,0,Math.PI*2);ctx.fill();
      // Dot
      ctx.beginPath();ctx.arc(p.x,y,4,0,Math.PI*2);ctx.fillStyle="#f5a623";ctx.fill();
      ctx.beginPath();ctx.arc(p.x,y,4,0,Math.PI*2);ctx.strokeStyle="rgba(245,166,35,0.5)";ctx.lineWidth=1.5;ctx.stroke();
      // Label
      ctx.fillStyle="rgba(245,166,35,0.8)";ctx.font="bold 10px 'Outfit',sans-serif";ctx.textAlign="center";
      ctx.fillText(p.lbs.toFixed(1),p.x,y-10);
    });

    // Future zone fade
    const fg=ctx.createLinearGradient(futureStart-20,0,futureStart+30,0);
    fg.addColorStop(0,"rgba(13,17,23,0)");fg.addColorStop(1,"rgba(13,17,23,0.3)");
    ctx.fillStyle=fg;ctx.fillRect(futureStart-20,0,totalW-futureStart+20,H);

    // Y-axis weight labels
    ctx.fillStyle="rgba(154,171,184,0.3)";ctx.font="9px 'DM Sans',sans-serif";ctx.textAlign="left";
    const yStep = Math.ceil((wMax-wMin)/4);
    for(let w=Math.ceil(wMin);w<=wMax;w+=yStep){
      ctx.fillText(`${w}`,4,yScale(w)+3);
    }
  },[windowDays,totalW,days]);

  useEffect(()=>{if(scrollRef.current){scrollRef.current.scrollLeft=Math.max(0,(windowDays-2)*DAY_WIDTH);}},[windowDays]);

  return(
    <div style={{position:"relative",borderRadius:16,overflow:"hidden",background:"var(--card)",border:"1px solid rgba(255,255,255,0.06)"}}>
      <div ref={scrollRef} style={{overflowX:"auto",overflowY:"hidden",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
        <div style={{width:totalW,height:H,position:"relative"}}>
          <canvas ref={canvasRef} style={{position:"absolute",top:0,left:0,width:totalW,height:H}}/>
          <div style={{position:"absolute",top:0,left:0,width:totalW,height:H,display:"flex"}}>
            {dayLabels.map((day,i)=>{
              const ed = eventData[i];
              return(
                <div key={day.date+i} style={{width:DAY_WIDTH,height:H,position:"relative",display:"flex",flexDirection:"column",alignItems:"center",paddingTop:8}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,zIndex:2,width:DAY_WIDTH-12}}>
                    {ed?.events?.map((ev,j)=><EventCard key={j} event={ev} onTap={onEventTap} expanded={expandedEvent===`${i}-${j}`}/>)}
                  </div>
                  <div style={{position:"absolute",bottom:8,left:0,right:0,textAlign:"center",zIndex:2}}>
                    <div style={{fontSize:10,fontWeight:day.isToday?800:500,color:day.isToday?"#f5a623":day.isFuture?"rgba(154,171,184,0.3)":"var(--t3)",fontFamily:"var(--font-b)"}}>{day.isToday?"TODAY":day.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{position:"absolute",top:0,left:0,width:24,height:"100%",background:"linear-gradient(90deg,var(--card),transparent)",pointerEvents:"none",zIndex:3}}/>
      <div style={{position:"absolute",top:0,right:0,width:24,height:"100%",background:"linear-gradient(270deg,var(--card),transparent)",pointerEvents:"none",zIndex:3}}/>
      <div style={{position:"absolute",bottom:24,right:12,fontSize:9,color:"var(--t3)",opacity:0.5,zIndex:3,fontFamily:"var(--font-b)",fontWeight:600}}>← swipe →</div>
    </div>
  );
}

// ============================================================
// IMPACT VIEW (Persistent scenarios, swipe-delete, drag-reorder)
// ============================================================
const PRESETS = [
  {name:"🏋️ Gym night vs 🍺 Drinks night", labels:["Hit the gym","Go out drinking"], a:{exercise:{type:"strength",duration:50},sleep:8,diet:4,alcohol:0},b:{alcohol:4,sleep:5.5,diet:2}},
  {name:"😴 8h sleep vs 6h sleep", labels:["Full rest","Short sleep"], a:{sleep:8,diet:3},b:{sleep:6,diet:3}},
  {name:"🎯 Clean week vs 😬 Normal week", labels:["Locked in","Coasting"], a:{diet:4,alcohol:0,sleep:7.5},b:{diet:3,alcohol:3,sleep:6.5}},
  {name:"✨ Dry month vs 🍺 Weekends out", labels:["Go dry","Drink weekends"], a:{alcohol:0,diet:4,sleep:7.5},b:{alcohol:4,diet:3,sleep:6.5}},
];

function DirectionArrow({direction}) {
  const config = {
    accelerates: { rotation: -45, color: "#06d6a0", label: "Accelerates progress" },
    helps: { rotation: -20, color: "#06d6a0", label: "Helps progress" },
    neutral: { rotation: 0, color: "#9aabb8", label: "Roughly neutral" },
    slows: { rotation: 20, color: "#f5a623", label: "Slows progress" },
    stalls: { rotation: 45, color: "#ef476f", label: "Stalls or reverses progress" },
  };
  const c = config[direction] || config.neutral;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", filter: `drop-shadow(0 0 8px ${c.color}44)` }}>
        <svg width={24} height={24} viewBox="0 0 24 24" style={{ transform: `rotate(${c.rotation}deg)` }}>
          <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke={c.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.label}</span>
    </div>
  );
}

function ScenarioResult({ result }) {
  if (!result) return null;
  const { a, b, labelA, labelB } = result;

  const renderImpactCard = (imp, label, idx) => {
    const color = imp.isPositive ? "var(--teal)" : imp.isNegative ? "var(--rose)" : "var(--t2)";
    const borderColor = imp.isPositive ? "rgba(6,214,160,0.25)" : imp.isNegative ? "rgba(239,71,111,0.2)" : "rgba(255,255,255,0.06)";
    const bgColor = imp.isPositive ? "rgba(6,214,160,0.05)" : imp.isNegative ? "rgba(239,71,111,0.05)" : "rgba(255,255,255,0.02)";

    // Build mechanism chain
    const mechanisms = imp.effects.map(e => {
      if (e.category === "alcohol" && e.fatOxSuppression) return `Fat burning paused ${e.fatOxSuppression[0]}-${e.fatOxSuppression[1]}% for ${e.fatOxDuration}`;
      if (e.category === "sleep") return e.summary?.split("—")[1]?.trim()?.split(".")[0] || null;
      if (e.category === "exercise" && e.mpsBoost) return e.mpsBoost !== "Minimal" ? "Muscle protein synthesis elevated 24-36 hrs" : null;
      if (e.category === "diet") return null; // diet summary is redundant
      return null;
    }).filter(Boolean);

    // Relatable framing
    const daysLo = Math.round(imp.daysEquiv[0]);
    const daysHi = Math.round(imp.daysEquiv[1]);
    const daysStr = daysLo === daysHi ? `~${daysLo}` : `${daysLo}-${daysHi}`;

    return (
      <div style={{ flex: 1, background: bgColor, borderRadius: 14, padding: "12px 14px", border: `1px solid ${borderColor}` }}>
        <div style={{ fontSize: 10, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
        <DirectionArrow direction={imp.direction} />
        {imp.severity && <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 8, lineHeight: 1.6 }}>
          {imp.isNegative
            ? `Could undo roughly ${daysStr} clean day${daysHi !== 1 ? "s" : ""} of progress`
            : imp.isPositive
            ? `Worth roughly ${daysStr} day${daysHi !== 1 ? "s" : ""} of forward momentum`
            : "Roughly breakeven for the week"
          }
        </div>}
        {mechanisms.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
            {mechanisms.map((m, i) => (
              <div key={i} style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5 }}>→ {m}</div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          {imp.effects.map((e, i) => e.conf && <ConfBadge key={i} level={e.conf} />)}
        </div>
      </div>
    );
  };

  return (
    <Card style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        {renderImpactCard(a, labelA, 0)}
        {renderImpactCard(b, labelB, 1)}
      </div>
      <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.7, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        {a.isPositive && b.isNegative
          ? `The gap between these two nights compounds fast. One builds momentum, the other burns it — and the recovery from the bad night costs an extra day or two on top.`
          : a.isPositive && !b.isNegative
          ? `Both are fine, but one actively moves the needle while the other just maintains. Over weeks, that difference adds up.`
          : `These pull your trajectory in opposite directions. Neither one night defines the outcome, but the pattern you repeat most often does.`
        }
      </div>
    </Card>
  );
}

// App-level hook — keeps AI state alive across tab switches
function useImpactState(currentWeight) {
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(null); // id of loading scenario
  const [selected, setSelected] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Load from storage on mount, clean up any stuck loading items
  useEffect(() => {
    S.get("impact-history").then(h => {
      if (h && Array.isArray(h)) {
        const cleaned = h.map(s => s.loading ? { ...s, loading: false, response: s.response || "Request interrupted. Try again." } : s);
        setScenarios(cleaned);
        S.set("impact-history", cleaned);
      }
    });
  }, []);

  const askLocal = useCallback((query) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const q = query.toLowerCase();
    const wt = currentWeight || TARGETS.startWeight;

    // Parse the query into a scenario and generate a response from Engine
    let response = "";

    // Alcohol patterns
    const drinkMatch = q.match(/(\d+)\s*(drink|beer|wine|cocktail|shot)/);
    const dryMatch = q.match(/dry|sober|no alcohol|quit drinking|stop drinking|skip drinking/);
    const weekendMatch = q.match(/weekend|saturday|friday|sunday/);

    if (drinkMatch) {
      const n = parseInt(drinkMatch[1]);
      const imp = Engine.alcoholImpact(n);
      if (imp) {
        const daysLo = Math.round(Math.abs(imp.weeklyTrajectoryShift[0]) / 0.07);
        const daysHi = Math.round(Math.abs(imp.weeklyTrajectoryShift[1]) / 0.07);
        response = imp.summary + "\n\n";
        response += "In practical terms, ${n} drinks would cancel out roughly ${daysLo}-${daysHi} clean days of progress. ".replace("${n}",n).replace("${daysLo}",daysLo).replace("${daysHi}",daysHi);
        response += "The scale will overreact by " + imp.scaleImpact[0] + "-" + imp.scaleImpact[1] + " lbs — " + imp.scaleNote + ".\n\n";
        if (n >= 4 && weekendMatch) {
          response += "A weekend pattern of this is what stalled progress Aug-Sep 2025. The weekday discipline gets eaten by the weekend recovery cycle — not just the calories, but the cascading sleep disruption and next-day eating patterns.\n\n";
        }
        response += "🟡 Evidence-supported";
      }
    } else if (dryMatch) {
      const weeks = q.match(/(\d+)\s*week/) ? parseInt(q.match(/(\d+)\s*week/)[1]) : 4;
      response = "Going dry for " + weeks + " weeks is the single highest-leverage change available. ";
      response += "Oct-Nov 2025 proved it: you dropped ~12 lbs in 6 weeks when you stopped drinking. ";
      response += "The mechanism chain: fat oxidation runs unimpeded (no 4-8 hour pauses), sleep architecture stays intact (better fat:muscle ratio during weight loss), no next-day hunger spikes, no weekend calorie surplus.\n\n";
      response += "At your current pace of 0.5 lbs/week, " + weeks + " weeks dry could accelerate that to roughly 0.7-0.9 lbs/week based on your own historical data. ";
      response += "That's the difference between coasting to 200 lbs and beating it.\n\n";
      response += "🟢 Well-established (your own data confirms the research)";
    }

    // Sleep patterns
    else if (q.match(/sleep|tired|rest|insomnia|nap/)) {
      const hrs = q.match(/(\d+\.?\d*)\s*h/) ? parseFloat(q.match(/(\d+\.?\d*)\s*h/)[1]) : null;
      if (hrs) {
        const imp = Engine.sleepImpact(hrs);
        response = imp.summary + "\n\n";
        if (hrs < 7) {
          response += "The hidden cost: when you're under-slept, the weight you lose shifts from ~56% fat to ~25% fat. You're losing the same scale weight but more of it is muscle. That's the opposite of recomp.\n\n";
          const ki = Array.isArray(imp.kcalIncrease) ? imp.kcalIncrease[0] + "-" + imp.kcalIncrease[1] : imp.kcalIncrease;
          response += "Expect roughly +" + ki + " kcal of hunger-driven eating tomorrow. Not willpower failure — it's hormonal.\n\n";
        }
        response += imp.conf === "high" ? "🟢 Well-established" : "🟡 Evidence-supported";
      } else {
        response = "Sleep is the second biggest lever after alcohol. The research is clear:\n\n";
        response += "→ 8+ hrs: weight loss is ~56% fat. Optimal hormone profile, recovery, and hunger regulation.\n";
        response += "→ 7 hrs: shifts to ~45% fat. Modest hunger increase (+100-200 kcal).\n";
        response += "→ 5.5 hrs: only ~25% fat. MPS drops 18%. Hunger spikes +300-450 kcal.\n\n";
        response += "Your recent average is ~7h with several nights at 6.4-6.8. Consistently hitting 7.5+ would meaningfully improve the fat:muscle ratio of every pound you lose.\n\n";
        response += "🟢 Well-established (Nedeltcheva et al.)";
      }
    }

    // Exercise
    else if (q.match(/gym|lift|strength|workout|train|exercise|run|cardio|miss/)) {
      const missMatch = q.match(/miss|skip|can't make it/);
      if (missMatch) {
        response = "Missing a single session is genuinely not a big deal. The TDEE impact is roughly 200-400 kcal, and there's no measurable detraining from one missed session.\n\n";
        response += "The risk isn't the one session — it's the pattern. You're at ~1x/week right now and the target is 3x. Each missed session when you're already under-frequency compounds the gap between where you are and where recomp happens.\n\n";
        response += "One week off entirely? Strength dips are minimal and you'll have it back within a session. The scale might actually drop (less glycogen/water), which feels good but isn't real fat loss.\n\n";
        response += "🟢 Well-established";
      } else {
        const dur = q.match(/(\d+)\s*min/) ? parseInt(q.match(/(\d+)\s*min/)[1]) : 45;
        const type = q.match(/run|cardio|jog/) ? "run" : "strength";
        const imp = Engine.exerciseImpact(type, dur);
        response = imp.summary + "\n\n";
        response += "Strength training is the highest-leverage activity for your goal because it's not just about calories burned — it's about maintaining and building lean mass during a cut. That's what makes you look different, not just lighter.\n\n";
        response += "🟢 Well-established";
      }
    }

    // Diet / food / eating
    else if (q.match(/eat|food|diet|meal|cheat|binge|restaurant|pizza|burger|takeout/)) {
      const bigMeal = q.match(/cheat|binge|blowout|huge|big meal|restaurant|pizza|burger|takeout|buffet/);
      if (bigMeal) {
        response = "A single big meal — even +1000 kcal over maintenance — adds roughly 0.15-0.25 lbs of actual fat. That's it.\n\n";
        response += "The scale, however, will scream at you. Expect +1-3 lbs from glycogen replenishment, sodium-driven water retention, and gut contents. This resolves in 2-3 days of normal eating.\n\n";
        response += "The real danger isn't the one meal — it's the \"well, I already blew it\" spiral that turns one meal into a lost weekend. One meal is a rounding error. A weekend of \"might as well\" is what erases a week of discipline.\n\n";
        response += "🟢 Well-established (energy balance math) / 🟡 Behavioral spiral pattern";
      } else {
        response = "Your weekday diet is solid — that's a real strength. The pattern from your data: weekdays are Cruise Control to Dialed In, weekends are where the surplus happens.\n\n";
        response += "Each Dialed In day creates roughly a 300-500 kcal deficit. Each Dumpster Fire day can erase 2-3 of those. The math is asymmetric — it's much easier to eat back a deficit than to create one.\n\n";
        response += "The highest-leverage nutrition move for you isn't tracking calories (you've tried, it doesn't stick). It's making one decision on Friday afternoon that sets up the weekend.\n\n";
        response += "🟢 Well-established";
      }
    }

    // Bachelor party / events
    else if (q.match(/bachelor|party|wedding|event|vacation|trip|holiday/)) {
      response = "The bachelor party is a single weekend. Even a full blowout — heavy drinking, bad food, no sleep — adds maybe 0.3-0.5 lbs of real fat.\n\n";
      response += "The scale will spike 3-5 lbs from water, glycogen, inflammation, and gut contents. This is not real weight gain. It resolves in 5-7 days of normal behavior.\n\n";
      response += "The plan from your coaching doc: cut alcohol 2-3 weeks before the bachelor party for visible sharpening, then enjoy the event without guilt. The 16 days between bachelor party and wedding is enough time to cut sodium, reduce inflammation, and look your best.\n\n";
      response += "One weekend does not undo months of work. The pattern matters, the event doesn't.\n\n";
      response += "🟡 Evidence-supported (individual response varies)";
    }

    // Fallback — general analysis
    else {
      const bp = Math.ceil((new Date(TARGETS.bachelorParty.date + "T00:00:00") - new Date()) / 864e5);
      response = "Here's where you stand: " + wt + " lbs with " + bp + " days to the bachelor party.\n\n";
      response += "At your proven pace of 0.5 lbs/week, you reach ~200 lbs right on schedule. The three biggest levers in order of impact:\n\n";
      response += "1. Alcohol — your own data from Oct-Nov 2025 is the strongest evidence. Going dry accelerated you to 0.75 lbs/week.\n";
      response += "2. Sleep — consistently 7.5+ hours shifts every pound you lose toward fat instead of muscle.\n";
      response += "3. Strength training 3x/week — you're at 1x. Getting to 3x is what creates the visual difference between 'lost weight' and 'looks built'.\n\n";
      response += "Try asking about a specific scenario: drinks tonight, a missed gym session, what happens at the bachelor party, or going dry for a month.\n\n";
      response += "🟢/🟡 Mixed confidence (levers are well-established, pace projections are evidence-supported)";
    }

    const newItem = { id, query, response, loading: false, timestamp: Date.now() };
    setScenarios(prev => {
      const updated = [newItem, ...prev];
      S.set("impact-history", updated);
      return updated;
    });
  }, [currentWeight]);

  const remove = useCallback((id) => {
    setScenarios(prev => {
      const updated = prev.filter(s => s.id !== id);
      S.set("impact-history", updated);
      return updated;
    });
  }, []);

  const removeSelected = useCallback(() => {
    setScenarios(prev => {
      const updated = prev.filter(s => !selectedIds.has(s.id));
      S.set("impact-history", updated);
      return updated;
    });
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds]);

  const reorder = useCallback((fromIdx, toIdx) => {
    setScenarios(prev => {
      const arr = [...prev];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      S.set("impact-history", arr);
      return arr;
    });
  }, []);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  return { scenarios, loading, selected, setSelected, askLocal, remove, removeSelected, reorder, selectMode, setSelectMode, selectedIds, toggleSelect };
}

// Swipeable scenario card
function SwipeableScenarioCard({ scenario, onDelete, selectMode, isSelected, onToggleSelect, onLongPress }) {
  const touchRef = useRef({ startX: 0, startY: 0, startTime: 0, swiping: false, longPressTimer: null });
  const [offsetX, setOffsetX] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, startTime: Date.now(), swiping: false, longPressTimer: null };
    touchRef.current.longPressTimer = setTimeout(() => {
      if (!touchRef.current.swiping) onLongPress?.();
    }, 500);
  };
  const handleTouchMove = (e) => {
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      touchRef.current.swiping = true;
      clearTimeout(touchRef.current.longPressTimer);
      setOffsetX(Math.min(0, dx)); // only swipe left
    }
  };
  const handleTouchEnd = () => {
    clearTimeout(touchRef.current.longPressTimer);
    if (offsetX < -80) {
      setDeleting(true);
      setTimeout(() => onDelete(), 300);
    } else {
      setOffsetX(0);
    }
  };

  const isLoading = scenario.loading;
  const timeAgo = (() => {
    const mins = Math.floor((Date.now() - scenario.timestamp) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  })();

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 16, marginBottom: 8, transition: deleting ? "opacity 0.3s, max-height 0.3s" : "none", opacity: deleting ? 0 : 1, maxHeight: deleting ? 0 : 1000 }}>
      {/* Delete zone behind */}
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 100, background: "rgba(239,71,111,0.15)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16 }}>
        <span style={{ color: "#ef476f", fontWeight: 800, fontSize: 12 }}>Delete</span>
      </div>
      {/* Card */}
      <div
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? "transform 0.2s ease" : "none", position: "relative", zIndex: 1 }}
      >
        <Card style={{ padding: "12px 14px", border: isSelected ? "1.5px solid var(--amber)" : "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            {selectMode && (
              <button onClick={() => onToggleSelect()} style={{
                width: 22, height: 22, borderRadius: 6, border: isSelected ? "2px solid var(--amber)" : "2px solid var(--t3)",
                background: isSelected ? "rgba(245,166,35,0.2)" : "transparent", cursor: "pointer", flexShrink: 0, marginTop: 2,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--amber)",
              }}>{isSelected ? "✓" : ""}</button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>{scenario.query}</div>
              {isLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--amber)", borderTopColor: "transparent", animation: "glow 1s linear infinite" }} />
                  <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600 }}>Analyzing...</span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{scenario.response}</div>
              )}
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 6 }}>{timeAgo}</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ImpactView({ currentWeight, impact }) {
  const { scenarios, loading, selected, setSelected, askLocal, remove, removeSelected, reorder, selectMode, setSelectMode, selectedIds, toggleSelect } = impact;
  const [customQ, setCustomQ] = useState("");
  const [dragIdx, setDragIdx] = useState(null);

  const runScenario = (preset) => {
    const result = Engine.compareNarrative(preset.a, preset.b, preset.labels);
    setSelected({ preset, result });
  };

  const handleAsk = () => {
    if (!customQ.trim()) return;
    askLocal(customQ.trim());
    setCustomQ("");
  };

  return (
    <div style={{ padding: "0 16px 100px", display: "flex", flexDirection: "column", gap: 14, animation: "fadeUp 0.4s ease" }}>
      <div style={{ fontFamily: "var(--font-d)", fontSize: 20, fontWeight: 800, color: "var(--t1)" }}>Decision Impact</div>
      <div style={{ fontSize: 13, color: "var(--t2)" }}>See how choices bend your trajectory</div>

      {/* Preset scenarios */}
      <div>
        <Label>Quick Scenarios</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {PRESETS.map((p, i) => (
            <Card key={i} onClick={() => runScenario(p)} style={{ padding: "12px 14px", cursor: "pointer", border: selected?.preset === p ? "1.5px solid var(--amber)" : "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>How each choice affects your trajectory</div>
            </Card>
          ))}
        </div>
      </div>

      {/* Scenario result — narrative, not point estimates */}
      {selected && <ScenarioResult result={selected.result} />}

      {/* Ask Anything */}
      <Card>
        <Label>Ask Anything</Label>
        <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4, marginBottom: 10 }}>Describe a scenario and see how it affects your trajectory</div>
        <textarea
          value={customQ} onChange={e => setCustomQ(e.target.value)}
          placeholder="e.g. 'What if I have 6 drinks tonight?' or 'What if I go dry for 4 weeks?'"
          rows={3}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "2px solid rgba(255,255,255,0.06)", background: "var(--raised)", color: "var(--t1)", fontSize: 14, outline: "none", resize: "none", lineHeight: 1.5 }}
          onFocus={e => e.target.style.borderColor = "var(--amber)"}
          onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
        />
        <div style={{ marginTop: 10 }}>
          <Btn onClick={handleAsk} disabled={!customQ.trim()} color="var(--amber)" full>
            🔮 Analyze Scenario
          </Btn>
        </div>
      </Card>

      {/* Saved scenarios */}
      {scenarios.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Label>Your Scenarios ({scenarios.length})</Label>
            <div style={{ display: "flex", gap: 8 }}>
              {selectMode && selectedIds.size > 0 && (
                <button onClick={removeSelected} style={{ background: "rgba(239,71,111,0.12)", border: "1px solid rgba(239,71,111,0.3)", borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#ef476f", cursor: "pointer", fontFamily: "var(--font-b)" }}>
                  Delete {selectedIds.size}
                </button>
              )}
              <button onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }} style={{
                background: selectMode ? "rgba(245,166,35,0.12)" : "transparent", border: selectMode ? "1px solid rgba(245,166,35,0.3)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: selectMode ? "var(--amber)" : "var(--t3)", cursor: "pointer", fontFamily: "var(--font-b)",
              }}>
                {selectMode ? "Done" : "Select"}
              </button>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 8, fontStyle: "italic" }}>
            {selectMode ? "Tap to select · Delete selected above" : "Swipe left to delete · Hold to reorder"}
          </div>
          {scenarios.map((s, idx) => (
            <SwipeableScenarioCard
              key={s.id}
              scenario={s}
              onDelete={() => remove(s.id)}
              selectMode={selectMode}
              isSelected={selectedIds.has(s.id)}
              onToggleSelect={() => toggleSelect(s.id)}
              onLongPress={() => {
                if (!selectMode) {
                  setSelectMode(true);
                  setSelectedIds(new Set([s.id]));
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function DashboardView({days}) {
  const bp=daysTo(TARGETS.bachelorParty.date);
  const latest=[...days].reverse().find(d=>d.weight);
  const str=days.slice(-7).filter(d=>d.activity?.strengthSession).length;
  const diet=days.slice(-7).filter(d=>d.diet).length;
  const drk=days.slice(-7).filter(d=>d.alcohol?.totalDrinks>0).length;
  const [expandedEvent,setExpandedEvent]=useState(null);

  const currentW=latest?.weight?.lbs||TARGETS.startWeight;
  const pace=Engine.derivedPace(days);
  const tdee=Engine.tdeePipeline(currentW,days);
  const projected=Engine.projectedWeight(currentW,pace.rate,bp/7);
  const milestones=Engine.checkMilestones(currentW);

  const slpDays=days.slice(-7).filter(d=>d.sleep?.hours);
  const slpAvg=slpDays.length?slpDays.reduce((a,d)=>a+d.sleep.hours,0)/slpDays.length:0;

  const paceLabel = pace.rate > 0.7 ? "Ahead of pace" : pace.rate > 0.3 ? "On pace" : pace.rate > 0 ? "Slow" : "Stalled";
  const paceColor = pace.rate > 0.7 ? "var(--teal)" : pace.rate > 0.3 ? "var(--teal)" : pace.rate > 0 ? "var(--amber)" : "var(--rose)";

  return(
    <div style={{padding:"0 16px 100px",display:"flex",flexDirection:"column",gap:12,animation:"fadeUp 0.4s ease"}}>
      <div style={{fontFamily:"var(--font-d)",fontSize:15,fontWeight:700,color:"var(--amber)",padding:"4px 0"}}>
        {bp} days to walk in looking better than everyone.
      </div>

      {/* Milestone celebrations */}
      {milestones.length>0&&(
        <div style={{background:"linear-gradient(135deg,rgba(6,214,160,0.08),rgba(245,166,35,0.08))",borderRadius:16,padding:"12px 16px",border:"1px solid rgba(6,214,160,0.2)"}}>
          {milestones.slice(-2).map((m,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"4px 0"}}>
              <span style={{fontSize:20}}>{m.icon}</span>
              <span style={{fontSize:13,fontWeight:700,color:"var(--teal)"}}>{m.label}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        {[{l:"Bachelor Party",d:TARGETS.bachelorParty.date,e:"🎉"},{l:"Wedding",d:TARGETS.wedding.date,e:"💍"}].map(c=>(
          <Card key={c.l} style={{flex:1,padding:"14px 16px"}} glow="#f5a623">
            <Label>{c.e} {c.l}</Label>
            <div style={{fontFamily:"var(--font-d)",fontSize:36,fontWeight:900,color:"var(--t1)",lineHeight:1.1,marginTop:4,textShadow:"0 0 20px rgba(245,166,35,0.15)"}}>{daysTo(c.d)}</div>
            <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>days</div>
          </Card>
        ))}
      </div>

      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <Label>Your Trajectory</Label>
          <Pill color={paceColor}>{paceLabel}</Pill>
        </div>
        <Trajectory windowDays={7} days={days}
          onEventTap={(ev)=>{setExpandedEvent(e=>e===ev._id?null:ev._id);}}
          expandedEvent={expandedEvent}
        />
      </div>

      <div style={{display:"flex",gap:10}}>
        <Card style={{flex:1,padding:"12px 14px"}} glow="#f5a623">
          <Label>Weight</Label>
          <div style={{fontFamily:"var(--font-d)",fontSize:28,fontWeight:800,color:"var(--t1)",marginTop:4}}>{latest?.weight?.lbs?.toFixed(1)||"—"}</div>
          <div style={{fontSize:11,color:"var(--t3)"}}>target: {TARGETS.bachelorParty.weight}</div>
        </Card>
        <Card style={{flex:1,padding:"12px 14px"}} glow="#06d6a0">
          <Label>Body Fat</Label>
          <div style={{fontFamily:"var(--font-d)",fontSize:28,fontWeight:800,color:"var(--t1)",marginTop:4}}>{latest?.weight?.bodyFat?.toFixed(1)||"—"}<span style={{fontSize:16,color:"var(--t2)"}}>%</span></div>
          <div style={{fontSize:11,color:"var(--t3)"}}>target: ~{TARGETS.bachelorParty.bodyFat}%</div>
        </Card>
      </div>

      <Card>
        <Label>This Week</Label>
        <div style={{display:"flex",gap:8,marginTop:10}}>
          {[{l:"Strength",v:`${str}/3`,c:str>=3?"var(--teal)":str>=2?"var(--gold)":"var(--rose)"},{l:"Diet Log",v:`${diet}/7`,c:diet>=5?"var(--teal)":diet>=3?"var(--gold)":"var(--rose)"},{l:"Drinks",v:`${drk}d`,c:drk===0?"var(--teal)":drk<=1?"var(--gold)":"var(--rose)"},{l:"Sleep",v:slpDays.length?`${slpAvg.toFixed(1)}h`:"—",c:slpAvg>=7.5?"var(--teal)":slpAvg>=7?"var(--gold)":"var(--rose)"}].map(s=>(
            <div key={s.l} style={{flex:1,textAlign:"center"}}>
              <div style={{fontFamily:"var(--font-d)",fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:9,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:2}}>{s.l}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Pattern-detected nudges (Phase 3) */}
      {(()=>{
        const nudges = Patterns.detectAll(days);
        const top = nudges.slice(0, 3);
        if (!top.length) return null;
        const typeColors = { alert: "var(--rose)", warning: "var(--amber)", nudge: "var(--sky)", positive: "var(--teal)" };
        return (
          <div>
            <Label>Patterns Detected</Label>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:6}}>
              {top.map((n,i) => (
                <Card key={i} style={{padding:"10px 14px",borderLeft:`3px solid ${typeColors[n.type]||"var(--t3)"}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:16}}>{n.icon}</span>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>{n.title}</span>
                  </div>
                  <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.6}}>{n.body}</div>
                </Card>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Engine-powered pace projection */}
      <Card glow="#f5a623">
        <div style={{fontSize:13,color:"var(--t1)",lineHeight:1.7}}>
          {pace.source==="derived" ? (
            <>Trending at <span style={{color:"var(--amber)",fontWeight:700}}>~{pace.rate.toFixed(1)} lbs/week</span>{pace.rate>=0.4?" — right on schedule":" — slower than the 0.5 target"}.
            Estimated TDEE: ~{tdee.tdee.toFixed(0)} kcal/day from {tdee.avgSteps.toLocaleString()} avg daily steps.</>
          ) : (
            <>Need more weight data to calculate your actual pace. Log weight daily — the trend emerges after 4-5 data points.</>
          )}
          {drk===0 && " Zero drink days this week — that's the Oct–Nov 2025 pattern."}
          {drk>1 && ` ${drk} drinking days this week. Going dry would accelerate pace.`}
        </div>
        <div style={{marginTop:6}}><ConfBadge level={pace.confidence} /></div>
      </Card>
    </div>
  );
}

// ============================================================
// LOG VIEW (unchanged from Phase 1 — date picker + persist)
// ============================================================
function LogView() {
  const [selDate,setSelDate]=useState(today());
  const [mode,setMode]=useState("vibes");
  const [score,setScore]=useState(null);
  const [meals,setMeals]=useState({breakfast:"",lunch:"",dinner:"",snacks:""});
  const [dietLogged,setDietLogged]=useState(false);
  const [drinks,setDrinks]=useState(0);
  const [dtype,setDtype]=useState("Beer");
  const [alcLogged,setAlcLogged]=useState(false);
  const [alcData,setAlcData]=useState(null);
  const [weightVal,setWeightVal]=useState("");
  const [bfVal,setBfVal]=useState("");
  const [weightLogged,setWeightLogged]=useState(false);
  const [sleepHrs,setSleepHrs]=useState("");
  const [sleepLogged,setSleepLogged]=useState(false);
  const [exType,setExType]=useState("strength");
  const [exDur,setExDur]=useState("");
  const [exLogged,setExLogged]=useState(false);
  const [justSaved,setJustSaved]=useState({d:false,a:false,w:false,s:false,e:false});

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setScore(null);setMeals({breakfast:"",lunch:"",dinner:"",snacks:""});setDietLogged(false);setDrinks(0);setDtype("Beer");setAlcLogged(false);setAlcData(null);
      setWeightVal("");setBfVal("");setWeightLogged(false);setSleepHrs("");setSleepLogged(false);setExDur("");setExLogged(false);
      setJustSaved({d:false,a:false,w:false,s:false,e:false});
      const d=await S.get(`diet:${selDate}`);if(cancelled)return;
      if(d){setDietLogged(true);if(d.mode==="vibes"&&d.score){setMode("vibes");setScore(d.score);}else if(d.mode==="meals"&&d.meals){setMode("meals");setMeals(d.meals);}}
      const a=await S.get(`alcohol:${selDate}`);if(cancelled)return;
      if(a){setAlcLogged(true);setAlcData(a);if(a.totalDrinks>0&&a.sessions?.length){setDrinks(0);setDtype(a.sessions[a.sessions.length-1]?.type||"Beer");}}
      const w=await S.get(`weight:${selDate}`);if(cancelled)return;
      if(w){setWeightLogged(true);setWeightVal(String(w.lbs||""));setBfVal(String(w.bodyFat||""));}
      const sl=await S.get(`sleep:${selDate}`);if(cancelled)return;
      if(sl){setSleepLogged(true);setSleepHrs(String(sl.hours||""));}
      const ac=await S.get(`activity:${selDate}`);if(cancelled)return;
      if(ac&&(ac.strengthSession||ac.run||ac.walk)){setExLogged(true);setExType(ac.strengthSession?"strength":ac.run?"run":"walk");setExDur(String(ac.duration||ac.runDuration||""));}
    })();return()=>{cancelled=true;};
  },[selDate]);

  const saveDiet=async()=>{const e=mode==="vibes"?{mode:"vibes",score,date:selDate}:{mode:"meals",meals,date:selDate};await S.set(`diet:${selDate}`,e);setDietLogged(true);setJustSaved(s=>({...s,d:true}));setTimeout(()=>setJustSaved(s=>({...s,d:false})),2000);};
  const saveAlc=async()=>{if(!drinks)return;const ex=alcData||{totalDrinks:0,sessions:[]};const updated={totalDrinks:ex.totalDrinks+drinks,sessions:[...ex.sessions,{count:drinks,type:dtype,time:new Date().toISOString()}],date:selDate};await S.set(`alcohol:${selDate}`,updated);setAlcData(updated);setAlcLogged(true);setDrinks(0);setJustSaved(s=>({...s,a:true}));setTimeout(()=>setJustSaved(s=>({...s,a:false})),2000);};
  const saveDry=async()=>{const updated={totalDrinks:0,sessions:[],date:selDate,dry:true};await S.set(`alcohol:${selDate}`,updated);setAlcData(updated);setAlcLogged(true);setJustSaved(s=>({...s,a:true}));setTimeout(()=>setJustSaved(s=>({...s,a:false})),2000);};

  const dietBtnLabel=justSaved.d?"✓ Saved":dietLogged?"Diet Logged — Update Log":"Log Diet";
  const dietBtnColor=justSaved.d?"var(--teal)":dietLogged?"var(--raised)":"var(--amber)";
  const dietBtnTextColor=dietLogged&&!justSaved.d?"var(--teal)":"#1a1000";
  const dietBtnBorder=dietLogged&&!justSaved.d?"1px solid rgba(6,214,160,0.35)":"none";
  const alcTotalToday=alcData?.totalDrinks||0;
  const alcIsDry=alcData?.dry||false;
  const isToday=selDate===today();

  const dateBtns=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().split("T")[0];dateBtns.push({date:ds,label:i===0?"Today":i===1?"Yday":d.toLocaleDateString("en-US",{weekday:"short"}),num:d.getDate()});}

  return(
    <div style={{padding:"0 16px 100px",display:"flex",flexDirection:"column",gap:14,animation:"fadeUp 0.4s ease"}}>
      <div style={{fontFamily:"var(--font-d)",fontSize:20,fontWeight:800,color:"var(--t1)"}}>Log</div>
      <div style={{display:"flex",gap:5}}>
        {dateBtns.map(db=>{const sel=selDate===db.date;return(<button key={db.date} onClick={()=>setSelDate(db.date)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"8px 4px",borderRadius:14,cursor:"pointer",minWidth:0,background:sel?"rgba(245,166,35,0.15)":"var(--card)",border:sel?"1.5px solid rgba(245,166,35,0.5)":"1.5px solid rgba(255,255,255,0.04)",transition:"all 0.2s"}}><span style={{fontSize:9,fontWeight:700,color:sel?"var(--amber)":"var(--t3)",textTransform:"uppercase",fontFamily:"var(--font-b)"}}>{db.label}</span><span style={{fontSize:18,fontWeight:800,color:sel?"var(--amber)":"var(--t2)",fontFamily:"var(--font-d)"}}>{db.num}</span></button>);})}
      </div>
      {!isToday&&<div style={{background:"rgba(79,195,247,0.08)",border:"1px solid rgba(79,195,247,0.2)",borderRadius:12,padding:"8px 14px",fontSize:12,color:"var(--sky)",fontWeight:600}}>Logging for {new Date(selDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</div>}
      <div style={{fontSize:13,color:"var(--t2)"}}>{isToday?"How'd today go?":"How'd that day go?"}</div>

      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><Label>Diet</Label>{dietLogged&&<Pill color="var(--teal)">Logged</Pill>}</div>
          <div style={{display:"flex",background:"var(--bg)",borderRadius:10,padding:2}}>
            {["vibes","meals"].map(m=>(<button key={m} onClick={()=>setMode(m)} style={{padding:"6px 16px",borderRadius:8,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",background:mode===m?"var(--raised)":"transparent",color:mode===m?"var(--t1)":"var(--t3)",fontFamily:"var(--font-b)",transition:"all 0.2s"}}>{m==="vibes"?"Vibes":"Meals"}</button>))}
          </div>
        </div>
        {mode==="vibes"?(<div style={{display:"flex",gap:6}}>{[1,2,3,4,5].map(s=>{const d=DIET[s],sel=score===s;return(<button key={s} onClick={()=>setScore(s)} style={{flex:1,padding:"14px 4px",borderRadius:14,cursor:"pointer",border:sel?`2px solid ${d.color}`:"1px solid rgba(255,255,255,0.06)",background:sel?`${d.color}18`:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",gap:6,transition:"all 0.2s"}}><span style={{fontSize:24}}>{d.emoji}</span><span style={{fontSize:8,fontWeight:800,color:sel?d.color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{d.name}</span></button>);})}</div>):(<div style={{display:"flex",flexDirection:"column",gap:8}}>{["breakfast","lunch","dinner","snacks"].map(m=>(<div key={m}><div style={{fontSize:10,color:"var(--t3)",fontWeight:700,textTransform:"capitalize",marginBottom:3}}>{m}</div><input value={meals[m]} onChange={e=>setMeals(p=>({...p,[m]:e.target.value}))} placeholder="What'd you have?" style={{width:"100%",padding:"10px 14px",borderRadius:12,border:"2px solid rgba(255,255,255,0.06)",background:"var(--raised)",color:"var(--t1)",fontSize:14,outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--amber)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.06)"}/></div>))}</div>)}
        <div style={{marginTop:14}}><Btn onClick={saveDiet} disabled={mode==="vibes"&&!score} color={dietBtnColor} full style={{color:dietBtnTextColor,border:dietBtnBorder,boxShadow:dietLogged&&!justSaved.d?"none":`0 0 14px ${dietBtnColor}33`}}>{dietBtnLabel}</Btn></div>
      </Card>

      <Card>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><Label>Alcohol</Label>{alcLogged&&<Pill color={alcIsDry?"var(--teal)":"var(--amber)"}>{alcIsDry?"✨ Dry Day":`${alcTotalToday} drink${alcTotalToday!==1?"s":""} logged`}</Pill>}</div>
        {alcLogged&&alcData?.sessions?.length>0&&(<div style={{background:"rgba(245,166,35,0.06)",border:"1px solid rgba(245,166,35,0.15)",borderRadius:12,padding:"8px 12px",marginTop:8,marginBottom:4}}><div style={{fontSize:11,color:"var(--t2)",marginBottom:4,fontWeight:600}}>{isToday?"Today's sessions:":"Sessions:"}</div>{alcData.sessions.map((s,i)=>(<div key={i} style={{fontSize:12,color:"var(--amber)",fontWeight:600}}>{s.count} {s.type} — {new Date(s.time).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</div>))}</div>)}
        <div style={{display:"flex",alignItems:"center",gap:16,marginTop:12,marginBottom:14}}>
          <button onClick={()=>setDrinks(Math.max(0,drinks-1))} style={{width:48,height:48,borderRadius:14,border:"1px solid rgba(255,255,255,0.08)",background:"var(--raised)",color:"var(--t1)",fontSize:22,cursor:"pointer",fontFamily:"var(--font-d)",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
          <div style={{flex:1,textAlign:"center"}}><div style={{fontFamily:"var(--font-d)",fontSize:44,fontWeight:900,color:drinks>0?"var(--amber)":"var(--t3)",textShadow:drinks>0?"0 0 20px rgba(245,166,35,0.2)":"none"}}>{drinks}</div><div style={{fontSize:10,color:"var(--t3)",fontWeight:700,textTransform:"uppercase"}}>{alcLogged?"add more":"drinks"}</div></div>
          <button onClick={()=>setDrinks(drinks+1)} style={{width:48,height:48,borderRadius:14,border:"1px solid rgba(255,255,255,0.08)",background:"var(--raised)",color:"var(--t1)",fontSize:22,cursor:"pointer",fontFamily:"var(--font-d)",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>{DRINKS.map(t=>(<button key={t} onClick={()=>setDtype(t)} style={{padding:"6px 14px",borderRadius:20,cursor:"pointer",border:dtype===t?"1px solid var(--amber)":"1px solid rgba(255,255,255,0.06)",background:dtype===t?"rgba(245,166,35,0.12)":"var(--bg)",color:dtype===t?"var(--amber)":"var(--t3)",fontSize:12,fontWeight:700,fontFamily:"var(--font-b)",transition:"all 0.2s"}}>{t}</button>))}</div>
        <Btn onClick={saveAlc} disabled={!drinks} color={justSaved.a?"var(--teal)":"var(--amber)"} full>{justSaved.a?"✓ Logged":drinks?(alcLogged?`Add ${drinks} more ${dtype}`:`Log ${drinks} ${dtype}`):(alcLogged?"Alcohol logged — add more above":"No drinks to log")}</Btn>
        {!alcLogged&&<button onClick={saveDry} style={{width:"100%",padding:10,borderRadius:12,marginTop:8,cursor:"pointer",border:"1px solid rgba(6,214,160,0.3)",background:"rgba(6,214,160,0.08)",color:"var(--teal)",fontSize:13,fontWeight:700,fontFamily:"var(--font-b)"}}>✨ Dry day — log it</button>}
        {alcLogged&&!alcIsDry&&<button onClick={saveDry} style={{width:"100%",padding:10,borderRadius:12,marginTop:8,cursor:"pointer",border:"1px solid rgba(255,255,255,0.06)",background:"transparent",color:"var(--t3)",fontSize:12,fontWeight:600,fontFamily:"var(--font-b)"}}>Reset to dry day</button>}
      </Card>

      {/* Weight */}
      <Card>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><Label>Weight</Label>{weightLogged&&<Pill color="var(--teal)">Logged</Pill>}</div>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:2}}>
            <div style={{fontSize:10,color:"var(--t3)",fontWeight:700,marginBottom:3}}>Weight (lbs)</div>
            <input type="number" inputMode="decimal" value={weightVal} onChange={e=>setWeightVal(e.target.value)} placeholder="208.6"
              style={{width:"100%",padding:"10px 14px",borderRadius:12,border:"2px solid rgba(255,255,255,0.06)",background:"var(--raised)",color:"var(--t1)",fontSize:18,fontWeight:700,fontFamily:"var(--font-d)",outline:"none"}}
              onFocus={e=>e.target.style.borderColor="var(--amber)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.06)"}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"var(--t3)",fontWeight:700,marginBottom:3}}>BF% <span style={{fontWeight:400,fontStyle:"italic"}}>(opt)</span></div>
            <input type="number" inputMode="decimal" value={bfVal} onChange={e=>setBfVal(e.target.value)} placeholder="17.9"
              style={{width:"100%",padding:"10px 14px",borderRadius:12,border:"2px solid rgba(255,255,255,0.06)",background:"var(--raised)",color:"var(--t1)",fontSize:18,fontWeight:700,fontFamily:"var(--font-d)",outline:"none"}}
              onFocus={e=>e.target.style.borderColor="var(--amber)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.06)"}/>
          </div>
        </div>
        <div style={{marginTop:10}}>
          <Btn onClick={async()=>{if(!weightVal)return;await S.set(`weight:${selDate}`,{lbs:parseFloat(weightVal),bodyFat:bfVal?parseFloat(bfVal):null,date:selDate});setWeightLogged(true);setJustSaved(s=>({...s,w:true}));setTimeout(()=>setJustSaved(s=>({...s,w:false})),2000);}}
            disabled={!weightVal} color={justSaved.w?"var(--teal)":weightLogged?"var(--raised)":"var(--amber)"} full
            style={{color:weightLogged&&!justSaved.w?"var(--teal)":"#1a1000",border:weightLogged&&!justSaved.w?"1px solid rgba(6,214,160,0.35)":"none",boxShadow:weightLogged&&!justSaved.w?"none":undefined}}>
            {justSaved.w?"✓ Saved":weightLogged?"Weight Logged — Update":"Log Weight"}
          </Btn>
        </div>
      </Card>

      {/* Sleep */}
      <Card>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><Label>Sleep</Label>{sleepLogged&&<Pill color="var(--teal)">Logged</Pill>}</div>
        <div style={{fontSize:10,color:"var(--t3)",fontWeight:700,marginBottom:3}}>Hours slept last night</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="number" inputMode="decimal" step="0.5" value={sleepHrs} onChange={e=>setSleepHrs(e.target.value)} placeholder="7.5"
            style={{flex:1,padding:"10px 14px",borderRadius:12,border:"2px solid rgba(255,255,255,0.06)",background:"var(--raised)",color:"var(--t1)",fontSize:18,fontWeight:700,fontFamily:"var(--font-d)",outline:"none"}}
            onFocus={e=>e.target.style.borderColor="var(--amber)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.06)"}/>
          <span style={{fontSize:14,color:"var(--t3)",fontWeight:700}}>hrs</span>
        </div>
        {sleepHrs && parseFloat(sleepHrs) > 0 && parseFloat(sleepHrs) < 12 && (
          <div style={{marginTop:8,fontSize:12,color:parseFloat(sleepHrs)>=7.5?"var(--teal)":parseFloat(sleepHrs)>=7?"var(--t2)":"var(--rose)",fontWeight:600}}>
            {parseFloat(sleepHrs) >= 8 ? "Optimal — fat loss ratio at its best" : parseFloat(sleepHrs) >= 7 ? "Adequate — close to the sweet spot" : parseFloat(sleepHrs) >= 5.5 ? "Below target — shifts weight loss toward muscle, not fat" : "Rough night — hunger hormones will spike tomorrow"}
          </div>
        )}
        <div style={{marginTop:10}}>
          <Btn onClick={async()=>{if(!sleepHrs)return;await S.set(`sleep:${selDate}`,{hours:parseFloat(sleepHrs),date:selDate});setSleepLogged(true);setJustSaved(s=>({...s,s:true}));setTimeout(()=>setJustSaved(s=>({...s,s:false})),2000);}}
            disabled={!sleepHrs} color={justSaved.s?"var(--teal)":sleepLogged?"var(--raised)":"var(--amber)"} full
            style={{color:sleepLogged&&!justSaved.s?"var(--teal)":"#1a1000",border:sleepLogged&&!justSaved.s?"1px solid rgba(6,214,160,0.35)":"none",boxShadow:sleepLogged&&!justSaved.s?"none":undefined}}>
            {justSaved.s?"✓ Saved":sleepLogged?"Sleep Logged — Update":"Log Sleep"}
          </Btn>
        </div>
      </Card>

      {/* Exercise */}
      <Card>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><Label>Exercise</Label>{exLogged&&<Pill color="var(--teal)">Logged</Pill>}</div>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {[{id:"strength",label:"🏋️ Strength"},{id:"run",label:"🏃 Run"},{id:"walk",label:"🚶 Walk"}].map(t=>(
            <button key={t.id} onClick={()=>setExType(t.id)} style={{
              flex:1,padding:"10px 6px",borderRadius:12,cursor:"pointer",fontSize:12,fontWeight:700,
              border:exType===t.id?"1.5px solid var(--amber)":"1px solid rgba(255,255,255,0.06)",
              background:exType===t.id?"rgba(245,166,35,0.12)":"var(--bg)",color:exType===t.id?"var(--amber)":"var(--t3)",
              fontFamily:"var(--font-b)",transition:"all 0.2s",textAlign:"center",
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="number" inputMode="numeric" value={exDur} onChange={e=>setExDur(e.target.value)} placeholder="45"
            style={{flex:1,padding:"10px 14px",borderRadius:12,border:"2px solid rgba(255,255,255,0.06)",background:"var(--raised)",color:"var(--t1)",fontSize:18,fontWeight:700,fontFamily:"var(--font-d)",outline:"none"}}
            onFocus={e=>e.target.style.borderColor="var(--amber)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.06)"}/>
          <span style={{fontSize:14,color:"var(--t3)",fontWeight:700}}>min</span>
        </div>
        <div style={{marginTop:10}}>
          <Btn onClick={async()=>{if(!exDur)return;const data={date:selDate,duration:parseInt(exDur)};if(exType==="strength"){data.strengthSession=true;}else if(exType==="run"){data.run=true;data.runDuration=parseInt(exDur);}else{data.walk=true;}await S.set(`activity:${selDate}`,data);setExLogged(true);setJustSaved(s=>({...s,e:true}));setTimeout(()=>setJustSaved(s=>({...s,e:false})),2000);}}
            disabled={!exDur} color={justSaved.e?"var(--teal)":exLogged?"var(--raised)":"var(--amber)"} full
            style={{color:exLogged&&!justSaved.e?"var(--teal)":"#1a1000",border:exLogged&&!justSaved.e?"1px solid rgba(6,214,160,0.35)":"none",boxShadow:exLogged&&!justSaved.e?"none":undefined}}>
            {justSaved.e?"✓ Saved":exLogged?"Exercise Logged — Update":"Log Exercise"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// WEEKLY SUMMARY (Phase 3 — replaces Timeline stub)
// ============================================================
function WeeklySummaryView({days}) {
  const last7 = days.slice(-7);
  const prev7 = days.slice(-14, -7);

  const stat = (arr, fn) => { const vals = arr.map(fn).filter(v => v != null); return vals.length ? { avg: vals.reduce((a,b)=>a+b,0)/vals.length, count: vals.length, vals } : null; };
  const curWeight = stat(last7, d => d.weight?.lbs);
  const prevWeight = stat(prev7, d => d.weight?.lbs);
  const curSleep = stat(last7, d => d.sleep?.hours);
  const prevSleep = stat(prev7, d => d.sleep?.hours);
  const curStr = last7.filter(d => d.activity?.strengthSession).length;
  const prevStr = prev7.filter(d => d.activity?.strengthSession).length;
  const curDrk = last7.filter(d => d.alcohol?.totalDrinks > 0).length;
  const prevDrk = prev7.filter(d => d.alcohol?.totalDrinks > 0).length;
  const curDiet = last7.filter(d => d.diet?.score).map(d => d.diet.score);
  const prevDiet = prev7.filter(d => d.diet?.score).map(d => d.diet.score);
  const curDietAvg = curDiet.length ? curDiet.reduce((a,b)=>a+b,0)/curDiet.length : null;
  const prevDietAvg = prevDiet.length ? prevDiet.reduce((a,b)=>a+b,0)/prevDiet.length : null;
  const logged = last7.filter(d => d.diet || d.alcohol || d.weight || d.sleep || d.activity).length;

  const delta = (cur, prev, unit, goodDir) => {
    if (cur == null || prev == null) return null;
    const diff = cur - prev;
    const dir = goodDir === "down" ? (diff < 0 ? "positive" : diff > 0 ? "negative" : "neutral") : (diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral");
    return { diff, dir, label: `${diff > 0 ? "+" : ""}${diff.toFixed(1)} ${unit}` };
  };

  const rows = [
    { label: "Weight", cur: curWeight?.avg?.toFixed(1), unit: "lbs", delta: delta(curWeight?.avg, prevWeight?.avg, "lbs", "down"), icon: "⚖️" },
    { label: "Sleep", cur: curSleep ? `${curSleep.avg.toFixed(1)}h` : "—", delta: delta(curSleep?.avg, prevSleep?.avg, "h", "up"), icon: "😴" },
    { label: "Strength", cur: `${curStr} sessions`, delta: { diff: curStr - prevStr, dir: curStr >= prevStr ? "positive" : "negative", label: `${curStr >= prevStr ? "+" : ""}${curStr - prevStr}` }, icon: "🏋️" },
    { label: "Drink Days", cur: `${curDrk} days`, delta: { diff: curDrk - prevDrk, dir: curDrk <= prevDrk ? "positive" : "negative", label: `${curDrk <= prevDrk ? "" : "+"}${curDrk - prevDrk}` }, icon: "🍺" },
    { label: "Diet Avg", cur: curDietAvg ? `${curDietAvg.toFixed(1)} / 5` : "—", delta: delta(curDietAvg, prevDietAvg, "", "up"), icon: "🍽️" },
  ];

  const dirColors = { positive: "var(--teal)", negative: "var(--rose)", neutral: "var(--t3)" };

  return (
    <div style={{padding:"0 16px 100px",display:"flex",flexDirection:"column",gap:14,animation:"fadeUp 0.4s ease"}}>
      <div style={{fontFamily:"var(--font-d)",fontSize:20,fontWeight:800,color:"var(--t1)"}}>Weekly Summary</div>
      <div style={{fontSize:13,color:"var(--t2)"}}>Last 7 days vs previous 7</div>

      {/* Stat rows */}
      <Card>
        {rows.map((r, i) => (
          <div key={r.label} style={{display:"flex",alignItems:"center",padding:"12px 0",borderBottom:i<rows.length-1?"1px solid rgba(255,255,255,0.04)":"none"}}>
            <span style={{fontSize:18,width:32}}>{r.icon}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>{r.label}</div>
              <div style={{fontSize:12,color:"var(--t2)"}}>{r.cur || "No data"}</div>
            </div>
            {r.delta && r.delta.diff !== 0 && (
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,fontWeight:800,color:dirColors[r.delta.dir]||"var(--t3)"}}>{r.delta.label}</div>
                <div style={{fontSize:9,color:"var(--t3)",textTransform:"uppercase"}}>vs prev week</div>
              </div>
            )}
            {r.delta && r.delta.diff === 0 && (
              <div style={{fontSize:11,color:"var(--t3)",fontWeight:600}}>Same</div>
            )}
            {!r.delta && (
              <div style={{fontSize:11,color:"var(--t3)",fontStyle:"italic"}}>Need more data</div>
            )}
          </div>
        ))}
      </Card>

      {/* Day-by-day breakdown */}
      <div>
        <Label>Day by Day</Label>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
          {last7.map(d => {
            const dow = new Date(d.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"});
            const num = new Date(d.date+"T12:00:00").getDate();
            const isToday = d.date === today();
            const signals = [];
            if (d.weight?.lbs) signals.push({icon:"⚖️",text:`${d.weight.lbs.toFixed(1)}`});
            if (d.diet?.score) signals.push({icon:DIET[d.diet.score]?.emoji,text:DIET[d.diet.score]?.name});
            if (d.alcohol?.totalDrinks > 0) signals.push({icon:"🍺",text:`${d.alcohol.totalDrinks} drinks`});
            else if (d.alcohol?.dry) signals.push({icon:"✨",text:"Dry"});
            if (d.sleep?.hours) signals.push({icon:"😴",text:`${d.sleep.hours.toFixed(1)}h`});
            if (d.activity?.strengthSession) signals.push({icon:"🏋️",text:`${d.activity.duration||"?"}m`});
            if (d.activity?.run) signals.push({icon:"🏃",text:`${d.activity.runDuration||"?"}m`});
            const empty = signals.length === 0;
            return (
              <Card key={d.date} style={{padding:"10px 12px",opacity:empty?0.5:1,border:isToday?"1px solid rgba(245,166,35,0.3)":"1px solid rgba(255,255,255,0.04)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:38,textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,color:isToday?"var(--amber)":"var(--t3)",textTransform:"uppercase"}}>{isToday?"Today":dow}</div>
                    <div style={{fontSize:18,fontWeight:800,color:isToday?"var(--amber)":"var(--t2)",fontFamily:"var(--font-d)"}}>{num}</div>
                  </div>
                  <div style={{flex:1,display:"flex",gap:8,flexWrap:"wrap"}}>
                    {signals.map((s,i) => (
                      <span key={i} style={{fontSize:12,color:"var(--t2)",fontWeight:500}}>{s.icon} {s.text}</span>
                    ))}
                    {empty && <span style={{fontSize:12,color:"var(--t3)",fontStyle:"italic"}}>Nothing logged</span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Logging consistency */}
      <Card glow={logged>=6?"#06d6a0":logged>=4?"#f5a623":"#ef476f"}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontFamily:"var(--font-d)",fontSize:36,fontWeight:900,color:logged>=6?"var(--teal)":logged>=4?"var(--amber)":"var(--rose)"}}>{logged}<span style={{fontSize:16,color:"var(--t2)"}}>/7</span></div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>Days Logged</div>
            <div style={{fontSize:12,color:"var(--t2)"}}>
              {logged >= 6 ? "Consistent. This is the foundation." : logged >= 4 ? "Decent, but gaps leave blind spots." : "Logging gaps are the #1 risk. 30 seconds a day."}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// STUB + SETTINGS
// ============================================================
function StubView({icon,title,desc,phase}) {
  return(<div style={{padding:"0 16px 100px",animation:"fadeUp 0.4s ease"}}><div style={{fontFamily:"var(--font-d)",fontSize:20,fontWeight:800,color:"var(--t1)",marginBottom:4}}>{title}</div><div style={{fontSize:13,color:"var(--t2)",marginBottom:20}}>{desc}</div><Card style={{textAlign:"center",padding:32}} glow="#f5a623"><div style={{fontSize:42,marginBottom:12,animation:"float 3s ease-in-out infinite"}}>{icon}</div><div style={{fontFamily:"var(--font-d)",fontSize:16,fontWeight:700,color:"var(--t1)",marginBottom:10}}>{title}</div><div style={{fontSize:13,color:"var(--t2)",lineHeight:1.7,maxWidth:280,margin:"0 auto",marginBottom:14}}>{desc}</div><Pill color="var(--sky)">{phase}</Pill></Card></div>);
}
function SettingsView({onReload}) {
  const [exp,setExp]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [syncInfo,setSyncInfo]=useState(null);
  useEffect(()=>{S.get("last-sync").then(s=>setSyncInfo(s));},[]);
  const doExport=async()=>{setExp(true);try{const keys=await S.list("");const data={};for(const k of keys){data[k]=await S.get(k);}navigator.clipboard.writeText(JSON.stringify(data,null,2));}catch{}setExp(false);};
  const doResync=async()=>{
    setSyncing(true);
    await Ingest.syncFromSnapshot(HC_SNAPSHOT);
    const info = {timestamp:Date.now(),source:"health_connect",daysCount:HC_SNAPSHOT.length};
    setSyncInfo(info);
    if(onReload) await onReload();
    setSyncing(false);
  };
  return(
    <div style={{padding:"0 16px 100px",display:"flex",flexDirection:"column",gap:14,animation:"fadeUp 0.4s ease"}}>
      <div style={{fontFamily:"var(--font-d)",fontSize:20,fontWeight:800,color:"var(--t1)"}}>Settings</div>
      <Card>
        <Label>Targets</Label>
        {[{l:"Bachelor Party",d:TARGETS.bachelorParty},{l:"Wedding",d:TARGETS.wedding}].map(t=>(
          <div key={t.l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
            <span style={{color:"var(--t2)",fontSize:13}}>{t.l}</span>
            <span style={{color:"var(--t1)",fontSize:13,fontWeight:600}}>{t.d.weight} lbs by {fmtDate(t.d.date)}</span>
          </div>
        ))}
      </Card>
      <Card>
        <Label>Data Sources</Label>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>Health Connect</div>
            <div style={{fontSize:11,color:"var(--t3)"}}>Fitbit + Fitdays → Weight, Sleep, Steps, Exercise</div>
          </div>
          <Pill color="var(--teal)">Connected</Pill>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0"}}>
          <div>
            <div style={{fontSize:12,color:"var(--t2)"}}>Last sync: {syncInfo ? new Date(syncInfo.timestamp).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : "Never"}</div>
            <div style={{fontSize:11,color:"var(--t3)"}}>{syncInfo ? `${syncInfo.daysCount} days synced` : ""}</div>
          </div>
          <button onClick={doResync} disabled={syncing} style={{padding:"6px 14px",borderRadius:10,border:"1px solid rgba(6,214,160,0.3)",background:syncing?"rgba(6,214,160,0.2)":"rgba(6,214,160,0.08)",color:"var(--teal)",fontSize:12,fontWeight:700,cursor:syncing?"default":"pointer",fontFamily:"var(--font-b)",opacity:syncing?0.7:1}}>{syncing?"Syncing...":"Refresh"}</button>
        </div>
        <div style={{fontSize:10,color:"var(--t3)",fontStyle:"italic",marginTop:4}}>POC: Data synced via Claude conversation. Web app: Fitbit OAuth auto-sync.</div>
      </Card>
      <Card glow="#f5a623">
        <Label>Philosophy</Label>
        <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.8,marginTop:8,fontStyle:"italic"}}>You are a whole, complicated, weird person. Anything in this app is a narrow representation of who you are. We give you context to live your life the way you want to, not to judge.</div>
      </Card>
      <Btn onClick={doExport} color="var(--raised)" full style={{color:"var(--t1)",border:"1px solid rgba(255,255,255,0.08)",boxShadow:"none"}}>{exp?"Exporting...":"📦 Export All Data"}</Btn>
      <div style={{textAlign:"center",marginTop:12}}>
        <div style={{fontSize:10,color:"var(--t3)"}}>Phase 3 — Intelligence + Data Ingestion</div>
        <div style={{fontSize:9,color:"var(--t3)",marginTop:2}}>Pattern detection ✓ Nudges ✓ Weekly summary ✓ Health Connect sync ✓</div>
      </div>
    </div>
  );
}

// ============================================================
// TAB BAR + APP
// ============================================================
const TABS=[{id:"dashboard",label:"Home",icon:"◎"},{id:"log",label:"Log",icon:"+"},{id:"impact",label:"Impact",icon:"⟁"},{id:"timeline",label:"Summary",icon:"〰"},{id:"progress",label:"Progress",icon:"◧"}];

function TabBar({active,onChange}){
  return(<div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(13,17,23,0.92)",backdropFilter:"blur(12px)",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",padding:"4px 0 env(safe-area-inset-bottom, 8px)",zIndex:100}}>{TABS.map(t=>{const a=active===t.id,isLog=t.id==="log";return(<button key={t.id} onClick={()=>onChange(t.id)} style={{flex:1,background:"none",border:"none",padding:"6px 0 2px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>{isLog?(<span style={{fontSize:20,width:42,height:42,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",marginTop:-12,fontFamily:"var(--font-d)",fontWeight:900,background:a?"var(--amber)":"var(--raised)",color:a?"#1a1000":"var(--t2)",boxShadow:a?"0 0 18px rgba(245,166,35,0.35)":"none",transition:"all 0.2s"}}>+</span>):(<span style={{fontSize:18,color:a?"var(--amber)":"var(--t3)",transition:"color 0.2s"}}>{t.icon}</span>)}<span style={{fontSize:9,fontWeight:a?800:500,color:a?"var(--amber)":"var(--t3)",fontFamily:"var(--font-b)"}}>{t.label}</span></button>);})}</div>);
}

export default function App(){
  const [tab,setTab]=useState("dashboard");
  const [loading,setLoading]=useState(true);
  const [state,setState]=useState({config:{},model:{},days:[]});

  useEffect(()=>{
    const t=setTimeout(()=>setLoading(false),3000);
    (async()=>{
      // Sync Health Connect snapshot if not already done recently
      const lastSync = await S.get("last-sync");
      const syncAge = lastSync ? Date.now() - lastSync.timestamp : Infinity;
      if (syncAge > 3600000) { // Re-sync if older than 1 hour
        await Ingest.syncFromSnapshot(HC_SNAPSHOT);
      }
      const s = await loadState();
      clearTimeout(t);
      setState(s);
      setLoading(false);
    })().catch(()=>{clearTimeout(t);setLoading(false);});
  },[]);
  useEffect(()=>{S.set("ui:tab",tab);},[tab]);
  useEffect(()=>{S.get("ui:tab").then(t=>{if(t&&TABS.find(x=>x.id===t))setTab(t);});},[]);

  const reloadState = useCallback(async () => {
    const s = await loadState();
    setState(s);
  }, []);

  const currentWeight=([...state.days].reverse().find(d=>d.weight)?.weight?.lbs)||TARGETS.startWeight;
  const impact = useImpactState(currentWeight);

  if(loading)return(<div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}><style>{CSS}</style><div style={{fontSize:36,animation:"glow 2s ease-in-out infinite",color:"var(--amber)"}}>◎</div><div style={{color:"var(--t2)",fontSize:14,fontFamily:"var(--font-d)",fontWeight:700}}>Loading...</div></div>);

  return(<><style>{CSS}</style><div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--t1)",fontFamily:"var(--font-b)",maxWidth:430,margin:"0 auto",position:"relative",WebkitFontSmoothing:"antialiased"}}><div style={{height:8}}/><div style={{padding:"8px 16px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontFamily:"var(--font-d)",fontSize:17,fontWeight:800}}>{tab==="dashboard"?"Mission Control":TABS.find(t=>t.id===tab)?.label||"Settings"}</div><button onClick={()=>setTab(tab==="settings"?"dashboard":"settings")} style={{background:"none",border:"none",color:tab==="settings"?"var(--amber)":"var(--t3)",fontSize:18,cursor:"pointer",padding:4}}>{tab==="settings"?"✕":"⚙"}</button></div>
    {tab==="dashboard"&&<DashboardView days={state.days}/>}
    {tab==="log"&&<LogView/>}
    {tab==="impact"&&<ImpactView currentWeight={currentWeight} impact={impact}/>}
    {tab==="timeline"&&<WeeklySummaryView days={state.days}/>}
    {tab==="progress"&&<StubView icon="📸" title="Progress" desc="Photo check-ins paired with data. Next: March 20, 2026." phase="Phase 3"/>}
    {tab==="settings"&&<SettingsView onReload={reloadState}/>}
    {tab!=="settings"&&<TabBar active={tab} onChange={setTab}/>}
  </div></>);
}
