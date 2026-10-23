// Forecast / projection math for a analytics campaign's daily series.
//
// What this does:
//   • Fits a simple-linear-regression model y = a + b·t per metric
//     (events / conversions / revenue) against day index.
//   • Computes prediction-interval bands (±1σ ≈ 68%, ±2σ ≈ 95%) using
//     the textbook formula: ŷ ± z · s · √(1 + 1/n + (t* − t̄)² / Sxx)
//     where s is the regression standard error and Sxx is the X variance.
//   • Extracts a day-of-week seasonal multiplier so weekly cycles
//     don't get smoothed away — projected values get scaled by the
//     multiplier for the day-of-week they fall on.
//   • Tests slope significance using a two-tailed t-test approximation
//     (df = n − 2). Anything with |t| > 2 we call "significant" loosely.
//   • Detects volatility (coefficient of variation), level shifts
//     (last-3-day mean vs prior mean), and a few other signals so the
//     UI can render opinionated verdicts.
//
// All math is plain JS — no deps. Numbers are clamped at 0 because
// negative events / revenue make no sense; that biases very-low forecasts
// slightly but the bias is honest in this domain.

const Z_68 = 1.0;
const Z_95 = 1.96;

function toUtcDay(iso) {
  // Treat YYYY-MM-DD as midnight UTC and return integer days since epoch.
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86400000);
}

function isoDate(day) {
  const d = new Date(day * 86400000);
  return d.toISOString().slice(0, 10);
}

function dayOfWeekUtc(day) {
  // 1970-01-01 (day 0) was a Thursday (UTC), index 4.
  return (day + 4) % 7;
}

function variance(xs, mean) {
  const n = xs.length;
  if (n < 2) return 0;
  let s = 0;
  for (const x of xs) s += (x - mean) * (x - mean);
  return s / (n - 1);
}

// Fit y = a + b·x via OLS and return the stats needed to project + draw
// prediction intervals. Robust to n=2 (returns a flat line at the mean).
function regress(xs, ys) {
  const n = xs.length;
  if (n === 0) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) * (xs[i] - meanX);
  }
  const slope = sxx > 0 ? num / sxx : 0;
  const intercept = meanY - slope * meanX;

  // Residual sum of squares + total sum of squares.
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yhat = intercept + slope * xs[i];
    ssRes += (ys[i] - yhat) * (ys[i] - yhat);
    ssTot += (ys[i] - meanY) * (ys[i] - meanY);
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const seReg = n > 2 ? Math.sqrt(ssRes / (n - 2)) : Math.sqrt(ssTot / Math.max(n - 1, 1));
  const seSlope = sxx > 0 ? seReg / Math.sqrt(sxx) : 0;
  const tStat = seSlope > 0 ? slope / seSlope : 0;
  const stdY = Math.sqrt(variance(ys, meanY));

  return {
    n,
    meanX,
    meanY,
    sxx,
    slope,
    intercept,
    ssRes,
    ssTot,
    r2,
    seReg,
    seSlope,
    tStat,
    stdY,
    cv: meanY > 0 ? stdY / meanY : null,
  };
}

// Prediction interval half-width at x*.
function predictionMargin(reg, x, z = Z_95) {
  if (!reg) return 0;
  const variancePart =
    1 + 1 / Math.max(reg.n, 1) + (reg.sxx > 0 ? (x - reg.meanX) ** 2 / reg.sxx : 0);
  return z * reg.seReg * Math.sqrt(variancePart);
}

function projectAt(reg, x) {
  if (!reg) return 0;
  return reg.intercept + reg.slope * x;
}

function clamp0(n) {
  return n < 0 ? 0 : n;
}

// Day-of-week multiplier table. For each weekday we compute mean(metric)
// on that weekday divided by overall mean. A weekday with only one
// observation falls back to 1 (no adjustment).
function dayOfWeekMultipliers(series, getValue) {
  const buckets = Array.from({ length: 7 }, () => []);
  for (const row of series) {
    buckets[row.dow].push(getValue(row));
  }
  const overallSum = series.reduce((s, r) => s + getValue(r), 0);
  const overallMean = series.length > 0 ? overallSum / series.length : 0;
  if (overallMean === 0) return buckets.map(() => 1);
  return buckets.map((b) => {
    if (b.length < 2) return 1;
    const m = b.reduce((a, b2) => a + b2, 0) / b.length;
    return m / overallMean;
  });
}

// Strength of weekly seasonality: how dispersed the multipliers are.
// If everything is 1.0 the campaign is steady; if it ranges 0.5–1.5
// there's a strong weekday effect worth surfacing.
function seasonalStrength(mults) {
  if (!mults || mults.length < 7) return 0;
  const mean = mults.reduce((a, b) => a + b, 0) / 7;
  if (mean === 0) return 0;
  return Math.sqrt(variance(mults, mean)) / mean;
}

// Level-shift detection: compare last-3-day mean vs the prior mean.
function levelShift(ys) {
  if (ys.length < 6) return null;
  const last3 = ys.slice(-3);
  const prior = ys.slice(0, -3);
  const meanLast = last3.reduce((a, b) => a + b, 0) / last3.length;
  const meanPrior = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (meanPrior === 0) return null;
  return (meanLast - meanPrior) / meanPrior;
}

// Pearson autocorrelation lag-1 — how much yesterday predicts today.
// Useful as a sanity check on the regression's iid-residual assumption.
function autocorrLag1(ys) {
  const n = ys.length;
  if (n < 3) return 0;
  const mean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 1; i < n; i++) {
    num += (ys[i] - mean) * (ys[i - 1] - mean);
  }
  for (let i = 0; i < n; i++) {
    den += (ys[i] - mean) * (ys[i] - mean);
  }
  return den > 0 ? num / den : 0;
}

// Main entry point.
//   dailyTrend: rows like { date: "YYYY-MM-DD", events, conversions, revenue, ... }
//   horizon:    integer days to project (default 14)
export function computeForecast(dailyTrend, { horizon = 14 } = {}) {
  if (!Array.isArray(dailyTrend) || dailyTrend.length < 2) {
    return {
      ready: false,
      reason:
        dailyTrend?.length === 1
          ? "Need at least 2 days of data — upload one more day to project."
          : "No daily data yet.",
    };
  }

  // Sort + normalise. Treat each row as one calendar day index since epoch.
  const sorted = [...dailyTrend].sort((a, b) => a.date.localeCompare(b.date));
  const series = sorted.map((d) => {
    const day = toUtcDay(d.date);
    return {
      date: d.date,
      day,
      dow: day != null ? dayOfWeekUtc(day) : 0,
      events: d.events || 0,
      conversions: d.conversions || 0,
      revenue: d.revenue || 0,
    };
  });

  const day0 = series[0].day;
  const xs = series.map((r) => r.day - day0);
  const eventsY = series.map((r) => r.events);
  const convY = series.map((r) => r.conversions);
  const revY = series.map((r) => r.revenue);

  const regEvents = regress(xs, eventsY);
  const regConv = regress(xs, convY);
  const regRev = regress(xs, revY);

  // Day-of-week multipliers per metric.
  const dowMult = {
    events: dayOfWeekMultipliers(series, (r) => r.events),
    conversions: dayOfWeekMultipliers(series, (r) => r.conversions),
    revenue: dayOfWeekMultipliers(series, (r) => r.revenue),
  };
  const seasonality = {
    events: seasonalStrength(dowMult.events),
    conversions: seasonalStrength(dowMult.conversions),
    revenue: seasonalStrength(dowMult.revenue),
  };

  // History block (for charts: actual values on each day).
  const history = series.map((r, i) => ({
    date: r.date,
    events: r.events,
    conversions: r.conversions,
    revenue: r.revenue,
    fitEvents: clamp0(projectAt(regEvents, xs[i])),
    fitConversions: clamp0(projectAt(regConv, xs[i])),
    fitRevenue: clamp0(projectAt(regRev, xs[i])),
    isActual: true,
  }));

  // Project forward.
  const lastX = xs[xs.length - 1];
  const forecast = [];
  for (let h = 1; h <= horizon; h++) {
    const x = lastX + h;
    const day = day0 + x;
    const dow = dayOfWeekUtc(day);

    const baseEvents = clamp0(projectAt(regEvents, x));
    const baseConv = clamp0(projectAt(regConv, x));
    const baseRev = clamp0(projectAt(regRev, x));

    const evMul = dowMult.events[dow] || 1;
    const cvMul = dowMult.conversions[dow] || 1;
    const rvMul = dowMult.revenue[dow] || 1;

    const evMargin68 = predictionMargin(regEvents, x, Z_68);
    const evMargin95 = predictionMargin(regEvents, x, Z_95);
    const cvMargin68 = predictionMargin(regConv, x, Z_68);
    const cvMargin95 = predictionMargin(regConv, x, Z_95);
    const rvMargin68 = predictionMargin(regRev, x, Z_68);
    const rvMargin95 = predictionMargin(regRev, x, Z_95);

    forecast.push({
      date: isoDate(day),
      dow,
      events: clamp0(baseEvents * evMul),
      conversions: clamp0(baseConv * cvMul),
      revenue: clamp0(baseRev * rvMul),
      eventsLo68: clamp0((baseEvents - evMargin68) * evMul),
      eventsHi68: clamp0((baseEvents + evMargin68) * evMul),
      eventsLo95: clamp0((baseEvents - evMargin95) * evMul),
      eventsHi95: clamp0((baseEvents + evMargin95) * evMul),
      conversionsLo68: clamp0((baseConv - cvMargin68) * cvMul),
      conversionsHi68: clamp0((baseConv + cvMargin68) * cvMul),
      conversionsLo95: clamp0((baseConv - cvMargin95) * cvMul),
      conversionsHi95: clamp0((baseConv + cvMargin95) * cvMul),
      revenueLo68: clamp0((baseRev - rvMargin68) * rvMul),
      revenueHi68: clamp0((baseRev + rvMargin68) * rvMul),
      revenueLo95: clamp0((baseRev - rvMargin95) * rvMul),
      revenueHi95: clamp0((baseRev + rvMargin95) * rvMul),
      isActual: false,
    });
  }

  // Cumulative revenue trace — useful "if trends hold, you'll hit $X by Y"
  // narrative. Forecast cumulative uses the (clamped) point estimate.
  const cumulative = [];
  let cum = 0;
  for (const r of history) {
    cum += r.revenue;
    cumulative.push({ date: r.date, cum, isActual: true });
  }
  // For the forecast portion we accumulate the central revenue prediction
  // AND we track band cumulative by adding the lo/hi marginal each day,
  // which is conservative (independent-day assumption) but readable.
  let cumLo68 = cum;
  let cumHi68 = cum;
  let cumLo95 = cum;
  let cumHi95 = cum;
  let cumProj = cum;
  for (const f of forecast) {
    cumProj += f.revenue;
    cumLo68 += f.revenueLo68;
    cumHi68 += f.revenueHi68;
    cumLo95 += f.revenueLo95;
    cumHi95 += f.revenueHi95;
    cumulative.push({
      date: f.date,
      proj: cumProj,
      lo68: cumLo68,
      hi68: cumHi68,
      lo95: cumLo95,
      hi95: cumHi95,
      isActual: false,
    });
  }

  // Headline totals: next 7 / next horizon-days.
  function sumOver(rows, key) {
    return rows.reduce((s, r) => s + (r[key] || 0), 0);
  }
  const next7 = forecast.slice(0, 7);
  const next14 = forecast.slice(0, Math.min(14, horizon));
  const next30 = forecast.slice(0, Math.min(30, horizon));
  const headlines = {
    next7: {
      conversions: sumOver(next7, "conversions"),
      conversionsLo: sumOver(next7, "conversionsLo95"),
      conversionsHi: sumOver(next7, "conversionsHi95"),
      revenue: sumOver(next7, "revenue"),
      revenueLo: sumOver(next7, "revenueLo95"),
      revenueHi: sumOver(next7, "revenueHi95"),
    },
    next14: {
      conversions: sumOver(next14, "conversions"),
      conversionsLo: sumOver(next14, "conversionsLo95"),
      conversionsHi: sumOver(next14, "conversionsHi95"),
      revenue: sumOver(next14, "revenue"),
      revenueLo: sumOver(next14, "revenueLo95"),
      revenueHi: sumOver(next14, "revenueHi95"),
    },
    next30: {
      conversions: sumOver(next30, "conversions"),
      conversionsLo: sumOver(next30, "conversionsLo95"),
      conversionsHi: sumOver(next30, "conversionsHi95"),
      revenue: sumOver(next30, "revenue"),
      revenueLo: sumOver(next30, "revenueLo95"),
      revenueHi: sumOver(next30, "revenueHi95"),
    },
  };

  // Days until a target revenue, projecting linearly from the last
  // historical cumulative point. Returns null if the slope is non-positive.
  function daysToTarget(target) {
    const lastCum = cum;
    if (lastCum >= target) return 0;
    const dailyMean = forecast.length
      ? forecast.reduce((s, r) => s + r.revenue, 0) / forecast.length
      : 0;
    if (dailyMean <= 0) return null;
    return Math.ceil((target - lastCum) / dailyMean);
  }

  const totalRevenueToDate = cum;
  const milestones = [];
  const next1k = Math.ceil((Math.floor(totalRevenueToDate / 1000) + 1) * 1000);
  if (next1k > totalRevenueToDate) {
    const eta = daysToTarget(next1k);
    if (eta != null) milestones.push({ target: next1k, days: eta });
  }
  const next10k = Math.ceil((Math.floor(totalRevenueToDate / 10000) + 1) * 10000);
  if (next10k > totalRevenueToDate && next10k !== next1k) {
    const eta = daysToTarget(next10k);
    if (eta != null) milestones.push({ target: next10k, days: eta });
  }

  // Statistical signals — feed to the verdicts card.
  const acRev = autocorrLag1(revY);
  const acConv = autocorrLag1(convY);
  const shift = {
    events: levelShift(eventsY),
    conversions: levelShift(convY),
    revenue: levelShift(revY),
  };

  return {
    ready: true,
    nDays: series.length,
    horizon,
    history,
    forecast,
    cumulative,
    regression: { events: regEvents, conversions: regConv, revenue: regRev },
    dowMult,
    seasonality,
    headlines,
    milestones,
    levelShift: shift,
    autocorr: { revenue: acRev, conversions: acConv },
    totalRevenueToDate,
  };
}
