// Aggregates a campaign's raw events into the metrics the dashboard needs.
// Pure function — call from the API route, return a single bundle the page
// can render without re-running expensive groupings.
//
// The conversion-analytics export has three funnel stages we care about:
//   1. "Learn More Clicked" — initial intent click
//   2. "CTC Clicked"        — click-to-call tap (or equivalent CTA)
//   3. "Base"               — revenue-recognised conversion event
// They're linked by `transaction_id`, so funnel rates are derived by checking
// which stages a given transaction reached.

const FUNNEL_STAGES = [
  { key: "learnMore", label: "Learn More Clicked", event: "Learn More Clicked" },
  { key: "ctc", label: "CTC Clicked", event: "CTC Clicked" },
  { key: "base", label: "Conversion (Base)", event: "Base" },
];

function toNumber(v) {
  if (v == null || v === "") return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function nonEmpty(v) {
  const s = (v ?? "").toString().trim();
  return s.length > 0 ? s : null;
}

function groupCount(events, field) {
  const m = new Map();
  for (const e of events) {
    const v = nonEmpty(e[field]) || "—";
    m.set(v, (m.get(v) || 0) + 1);
  }
  return Array.from(m.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

// For a given dimension, count: total events, unique users (IPs), unique
// transactions, conversions, and revenue. Returns ranked rows.
function groupRich(events, field) {
  const m = new Map();
  for (const e of events) {
    const v = nonEmpty(e[field]) || "—";
    const cur = m.get(v) || {
      key: v,
      events: 0,
      conversions: 0,
      revenue: 0,
      ips: new Set(),
      txns: new Set(),
    };
    cur.events += 1;
    if (e.session_user_ip) cur.ips.add(e.session_user_ip);
    if (e.transaction_id) cur.txns.add(e.transaction_id);
    if (e.event_name === "Base") {
      cur.conversions += 1;
      cur.revenue += toNumber(e.revenue);
    }
    m.set(v, cur);
  }
  return Array.from(m.values())
    .map((r) => ({
      key: r.key,
      events: r.events,
      conversions: r.conversions,
      revenue: r.revenue,
      uniqueUsers: r.ips.size,
      transactions: r.txns.size,
    }))
    .sort((a, b) => b.events - a.events);
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor((p / 100) * sortedAsc.length)),
  );
  return sortedAsc[idx];
}

const LATENCY_BUCKETS = [
  { key: "instant", label: "Under 1 min", maxHours: 1 / 60 },
  { key: "min5", label: "1–5 min", maxHours: 5 / 60 },
  { key: "min30", label: "5–30 min", maxHours: 30 / 60 },
  { key: "h2", label: "30 min – 2 h", maxHours: 2 },
  { key: "h24", label: "2 h – 24 h", maxHours: 24 },
  { key: "d7", label: "1–7 days", maxHours: 24 * 7 },
  { key: "later", label: "Over 7 days", maxHours: Infinity },
];

function isInAppBrowser(b) {
  if (!b) return false;
  const v = b.toLowerCase();
  return (
    v.includes("facebook") ||
    v.includes("instagram") ||
    v.includes("fb_iab") ||
    v.includes("fban") ||
    v.includes("messenger") ||
    v.includes("tiktok")
  );
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function computeInsights(events) {
  const totalEvents = events.length;
  const baseEvents = events.filter((e) => e.event_name === "Base");
  const conversions = baseEvents.length;
  const revenue = baseEvents.reduce((s, e) => s + toNumber(e.revenue), 0);

  // Funnel: per-transaction stage reach.
  const txnStages = new Map();
  for (const e of events) {
    const txn = e.transaction_id;
    if (!txn) continue;
    if (!txnStages.has(txn)) txnStages.set(txn, new Set());
    txnStages.get(txn).add(e.event_name);
  }
  const transactions = txnStages.size;
  const stageReach = FUNNEL_STAGES.map((stage) => {
    let n = 0;
    for (const set of txnStages.values()) if (set.has(stage.event)) n++;
    return { ...stage, count: n };
  });
  const funnel = stageReach.map((s, i) => ({
    ...s,
    rateFromFirst:
      stageReach[0].count > 0 ? s.count / stageReach[0].count : null,
    rateFromPrev:
      i === 0
        ? null
        : stageReach[i - 1].count > 0
          ? s.count / stageReach[i - 1].count
          : null,
  }));

  // ── Unique-user analysis (by session_user_ip) ──────────────────────────
  // session_user_ip is the closest stand-in for a "person" we have — IPs
  // can be shared across a household but it's the most stable identifier
  // in this export.
  const ipStats = new Map();
  for (const e of events) {
    const ip = e.session_user_ip;
    if (!ip) continue;
    const cur = ipStats.get(ip) || {
      ip,
      events: 0,
      conversions: 0,
      revenue: 0,
      txns: new Set(),
      city: e.city,
      region: e.region,
      country: e.country,
      device: e.device_type,
      brand: e.brand,
      platform: e.platform,
      browser: e.browser,
      carrier: e.carrier,
      firstSeen: e.date,
      lastSeen: e.date,
    };
    cur.events += 1;
    if (e.transaction_id) cur.txns.add(e.transaction_id);
    if (e.event_name === "Base") {
      cur.conversions += 1;
      cur.revenue += toNumber(e.revenue);
    }
    if (e.date && (!cur.firstSeen || e.date < cur.firstSeen)) {
      cur.firstSeen = e.date;
    }
    if (e.date && (!cur.lastSeen || e.date > cur.lastSeen)) {
      cur.lastSeen = e.date;
    }
    ipStats.set(ip, cur);
  }
  const uniqueUsers = ipStats.size;
  let repeatUsers = 0;
  let convFromRepeat = 0;
  let revenueFromRepeat = 0;
  for (const r of ipStats.values()) {
    if (r.txns.size > 1) {
      repeatUsers += 1;
      convFromRepeat += r.conversions;
      revenueFromRepeat += r.revenue;
    }
  }
  const repeatUserShare = uniqueUsers > 0 ? repeatUsers / uniqueUsers : null;

  // Top engaged users by event volume — useful to spot whales or heavy
  // bot-like clusters. Caps at the top 12 and converts the txns Set so
  // the value is JSON-serialisable.
  const topEngagedUsers = Array.from(ipStats.values())
    .map((r) => ({
      ip: r.ip,
      events: r.events,
      conversions: r.conversions,
      revenue: r.revenue,
      transactions: r.txns.size,
      city: r.city,
      region: r.region,
      device: r.device,
      platform: r.platform,
      brand: r.brand,
      browser: r.browser,
      carrier: r.carrier,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
    }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 12);

  // ── Click-to-conversion latency ────────────────────────────────────────
  const baseLatencies = baseEvents
    .map((e) => toNumber(e.delta_hours))
    .filter((n) => n >= 0);
  const sortedLatencies = [...baseLatencies].sort((a, b) => a - b);
  const avgLatencyHours = baseLatencies.length
    ? baseLatencies.reduce((s, n) => s + n, 0) / baseLatencies.length
    : null;
  const medianLatencyHours = percentile(sortedLatencies, 50);
  const p90LatencyHours = percentile(sortedLatencies, 90);

  // Buckets carry the conversion count AND the revenue that landed in each
  // bucket — surfaces which speed-to-conversion band actually pays. The
  // share/avg derivations are added in a second pass once we know totals.
  const latencyBuckets = LATENCY_BUCKETS.map((b) => ({
    ...b,
    count: 0,
    revenue: 0,
  }));
  for (const e of baseEvents) {
    const h = toNumber(e.delta_hours);
    if (h < 0) continue;
    for (const b of latencyBuckets) {
      if (h <= b.maxHours) {
        b.count += 1;
        b.revenue += toNumber(e.revenue);
        break;
      }
    }
  }
  const latencyTotalRevenue = latencyBuckets.reduce(
    (s, b) => s + b.revenue,
    0,
  );
  const latencyTotalCount = latencyBuckets.reduce((s, b) => s + b.count, 0);
  for (const b of latencyBuckets) {
    b.avgRevenue = b.count > 0 ? b.revenue / b.count : 0;
    b.revShare =
      latencyTotalRevenue > 0 ? b.revenue / latencyTotalRevenue : 0;
    b.countShare =
      latencyTotalCount > 0 ? b.count / latencyTotalCount : 0;
  }

  // ── Event-type breakdown ───────────────────────────────────────────────
  const byEventName = groupCount(events, "event_name");
  const byRevenueType = groupCount(
    baseEvents.filter((e) => nonEmpty(e.revenue_type)),
    "revenue_type",
  );

  // ── Geo & device breakdowns (rich rows) ────────────────────────────────
  const byState = groupRich(events, "region").slice(0, 25);
  const byCity = groupRich(events, "city").slice(0, 20);
  const byDma = groupRich(
    events.filter((e) => e.dma && e.dma !== "0"),
    "dma",
  ).slice(0, 15);
  const byDeviceType = groupRich(events, "device_type");
  const byPlatform = groupRich(events, "platform");
  const byBrand = groupRich(events, "brand").slice(0, 12);
  const byBrowser = groupRich(events, "browser").slice(0, 10);
  const byCarrier = groupRich(
    events.filter((e) => nonEmpty(e.carrier)),
    "carrier",
  ).slice(0, 15);
  const byIsp = groupRich(events, "isp").slice(0, 15);
  const byOsVersion = groupRich(events, "os_version").slice(0, 12);
  const byOffer = groupRich(
    events.filter((e) => nonEmpty(e.sub1)),
    "sub1",
  ).slice(0, 10);
  const byOfferName = groupRich(events, "offer_name").slice(0, 10);

  // Top 3 states share of revenue — a quick "concentration risk" read.
  const totalConvs = conversions;
  const geoConcentrationTop3 =
    totalConvs > 0
      ? byState
          .slice(0, 3)
          .reduce((s, r) => s + r.conversions, 0) / totalConvs
      : null;

  // In-app vs mobile browser. Useful because in-app browsers historically
  // convert worse than the system Chrome/Safari for forms.
  let inAppEvents = 0;
  let inAppConvs = 0;
  let inAppRevenue = 0;
  let webEvents = 0;
  let webConvs = 0;
  let webRevenue = 0;
  for (const e of events) {
    const inApp = isInAppBrowser(e.browser);
    if (inApp) {
      inAppEvents += 1;
      if (e.event_name === "Base") {
        inAppConvs += 1;
        inAppRevenue += toNumber(e.revenue);
      }
    } else {
      webEvents += 1;
      if (e.event_name === "Base") {
        webConvs += 1;
        webRevenue += toNumber(e.revenue);
      }
    }
  }
  const surfaceSplit = [
    {
      key: "inApp",
      label: "In-app browser",
      events: inAppEvents,
      conversions: inAppConvs,
      revenue: inAppRevenue,
    },
    {
      key: "web",
      label: "Native / web browser",
      events: webEvents,
      conversions: webConvs,
      revenue: webRevenue,
    },
  ];

  // ── Daily trend ────────────────────────────────────────────────────────
  const byDate = new Map();
  for (const e of events) {
    const date = (e.date || "").slice(0, 10);
    if (!date) continue;
    const cur = byDate.get(date) || {
      date,
      events: 0,
      conversions: 0,
      revenue: 0,
      ips: new Set(),
    };
    cur.events += 1;
    if (e.session_user_ip) cur.ips.add(e.session_user_ip);
    if (e.event_name === "Base") {
      cur.conversions += 1;
      cur.revenue += toNumber(e.revenue);
    }
    byDate.set(date, cur);
  }
  const dailyTrend = Array.from(byDate.values())
    .map(({ ips, ...rest }) => ({ ...rest, uniqueUsers: ips.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Hour of day ────────────────────────────────────────────────────────
  const byHour = new Array(24).fill(0).map((_, h) => ({
    hour: h,
    events: 0,
    conversions: 0,
    revenue: 0,
  }));
  for (const e of events) {
    const t = e.date || "";
    const m = t.match(/\s(\d{2}):/);
    if (!m) continue;
    const h = parseInt(m[1], 10);
    if (h < 0 || h > 23) continue;
    byHour[h].events += 1;
    if (e.event_name === "Base") {
      byHour[h].conversions += 1;
      byHour[h].revenue += toNumber(e.revenue);
    }
  }

  // ── Day of week ────────────────────────────────────────────────────────
  const byDayOfWeek = DOW_LABELS.map((label, dow) => ({
    dow,
    label,
    events: 0,
    conversions: 0,
    revenue: 0,
  }));
  for (const e of events) {
    if (!e.date) continue;
    const d = new Date(e.date.replace(" ", "T") + "Z");
    if (Number.isNaN(d.valueOf())) continue;
    const dow = d.getUTCDay();
    byDayOfWeek[dow].events += 1;
    if (e.event_name === "Base") {
      byDayOfWeek[dow].conversions += 1;
      byDayOfWeek[dow].revenue += toNumber(e.revenue);
    }
  }

  // ── Quality / fraud-ish signals ────────────────────────────────────────
  // "heavyIPs": IPs with 5+ events — could be a power user or could be a
  //   bot/click farm. The UI surfaces them but doesn't accuse.
  // "instantConversions": Base rows with delta_hours == 0 — legitimate when
  //   the user converted instantly, but a high share is a smell.
  // "duplicateUserAgentsAcrossIPs": same UA seen on > 1 IP. Could be
  //   default mobile UA on a carrier NAT, but also a fraud tell.
  const heavyIPs = Array.from(ipStats.values()).filter(
    (r) => r.events >= 5,
  ).length;
  const heavyIPEventShare =
    totalEvents > 0
      ? Array.from(ipStats.values())
          .filter((r) => r.events >= 5)
          .reduce((s, r) => s + r.events, 0) / totalEvents
      : null;

  let instantConversions = 0;
  for (const e of baseEvents) {
    if (toNumber(e.delta_hours) <= 0) instantConversions += 1;
  }
  const instantConversionShare =
    conversions > 0 ? instantConversions / conversions : null;

  const uaToIPs = new Map();
  for (const e of events) {
    const ua = e.http_user_agent;
    const ip = e.session_user_ip;
    if (!ua || !ip) continue;
    if (!uaToIPs.has(ua)) uaToIPs.set(ua, new Set());
    uaToIPs.get(ua).add(ip);
  }
  let sharedUAs = 0;
  for (const ips of uaToIPs.values()) if (ips.size > 1) sharedUAs += 1;

  // ── Top revenue rows (richest conversions) ─────────────────────────────
  const topConversions = baseEvents
    .map((e) => ({
      conversion_id: e.conversion_id,
      revenue: toNumber(e.revenue),
      revenue_type: e.revenue_type,
      date: e.date,
      region: e.region,
      city: e.city,
      device_type: e.device_type,
      platform: e.platform,
      browser: e.browser,
      offer: e.sub1 || e.offer_name,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // ── Date bounds ────────────────────────────────────────────────────────
  let firstSeen = null;
  let lastSeen = null;
  for (const e of events) {
    const d = e.date;
    if (!d) continue;
    if (!firstSeen || d < firstSeen) firstSeen = d;
    if (!lastSeen || d > lastSeen) lastSeen = d;
  }

  return {
    totalEvents,
    transactions,
    conversions,
    revenue,
    avgRevenuePerConversion: conversions > 0 ? revenue / conversions : null,
    avgLatencyHours,
    medianLatencyHours,
    p90LatencyHours,
    firstSeen,
    lastSeen,

    funnel,
    byEventName,
    byRevenueType,

    uniqueUsers,
    repeatUsers,
    repeatUserShare,
    eventsPerUser: uniqueUsers > 0 ? totalEvents / uniqueUsers : null,
    convPerUser: uniqueUsers > 0 ? conversions / uniqueUsers : null,
    convFromRepeat,
    revenueFromRepeat,
    topEngagedUsers,

    latencyBuckets,

    byState,
    byCity,
    byDma,
    byDeviceType,
    byPlatform,
    byBrand,
    byBrowser,
    byCarrier,
    byIsp,
    byOsVersion,
    byOffer,
    byOfferName,

    surfaceSplit,
    geoConcentrationTop3,

    dailyTrend,
    byHour,
    byDayOfWeek,

    qualitySignals: {
      heavyIPs,
      heavyIPEventShare,
      instantConversions,
      instantConversionShare,
      sharedUAs,
    },

    topConversions,
  };
}
