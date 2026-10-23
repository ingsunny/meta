// DB queries that power the /journey dashboard.
//
// Joins are by **session_ip** (the IP the visitor used at click time).
// The conv report is the source of truth for outcomes; the fuse click
// report is the secondary record that adds fbclid + click-side IP + UA.
// Both ends pivot on the same IP so we get a real user view (one row per
// unique visitor instead of per-click).
//
// Device-type is captured but not part of the join — IPs in the data
// rarely host multiple device types within the same time window, and
// the conv report often lowercases / normalises the device differently,
// so requiring a device match drops too many real matches.

import { query, one } from "@/lib/db";

function buildWhere(filters) {
  const where = [];
  const params = [];
  if (filters.from) { where.push("ca.last_click_at >= ?"); params.push(filters.from); }
  if (filters.to)   { where.push("ca.first_click_at <= ?"); params.push(filters.to); }
  if (filters.country) {
    where.push("COALESCE(cc.country_code, lc.click_country) = ?");
    params.push(filters.country);
  }
  if (filters.device) {
    where.push("COALESCE(cc.device_type, lc.device_type) = ?");
    params.push(filters.device);
  }
  if (filters.search) {
    const s = `%${filters.search}%`;
    where.push(
      "(ca.ip LIKE ? OR lc.affiliate_click_id LIKE ? OR COALESCE(cc.city, lc.click_city) LIKE ? OR COALESCE(cc.region, lc.click_state) LIKE ?)",
    );
    params.push(s, s, s, s);
  }
  if (filters.matched === "yes") {
    where.push("va.conv_count > 0");
  } else if (filters.matched === "no") {
    where.push("(va.conv_count IS NULL OR va.conv_count = 0)");
  }
  return { where, params };
}

// CTE that aggregates per-IP and joins:
//   • latest_click — for fbclid + click count + click-side device/geo
//   • latest_conv  — for geo + device (THIS is the source of truth)
//   • convs_agg    — for conv count / revenue / event chain
const CTE = `
  WITH clicks_agg AS (
    SELECT session_ip AS ip,
           COUNT(*) AS click_count,
           MIN(session_time) AS first_click_at,
           MAX(session_time) AS last_click_at
      FROM journey_clicks
     WHERE session_ip IS NOT NULL
     GROUP BY session_ip
  ),
  latest_click AS (
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (
                  PARTITION BY session_ip
                  ORDER BY session_time DESC
                ) AS rn
        FROM journey_clicks
       WHERE session_ip IS NOT NULL
    ) t WHERE rn = 1
  ),
  latest_conv AS (
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (
                  PARTITION BY session_user_ip
                  ORDER BY conv_date DESC
                ) AS rn
        FROM journey_conversions
       WHERE session_user_ip IS NOT NULL
    ) t WHERE rn = 1
  ),
  convs_agg AS (
    SELECT session_user_ip AS ip,
           COUNT(*) AS conv_count,
           COALESCE(SUM(revenue), 0) AS conv_revenue,
           MIN(conv_date) AS first_conv_at,
           MAX(conv_date) AS last_conv_at,
           GROUP_CONCAT(DISTINCT event_name ORDER BY conv_date SEPARATOR ' › ') AS conv_events
      FROM journey_conversions
     WHERE session_user_ip IS NOT NULL
     GROUP BY session_user_ip
  )
`;

const SORT_COLUMNS = {
  last_click_at: "ca.last_click_at",
  first_click_at: "ca.first_click_at",
  click_count: "ca.click_count",
  conv_count: "conv_count",
  conv_revenue: "conv_revenue",
  latency: "latency_minutes",
  ip: "ca.ip",
  country: "country",
  city: "city",
  device: "device_type",
};

export async function getRows({
  filters = {},
  sort = "last_click_at",
  dir = "desc",
  limit = 100,
  offset = 0,
} = {}) {
  const { where, params } = buildWhere(filters);
  const orderCol = SORT_COLUMNS[sort] || "ca.last_click_at";
  const orderDir = dir === "asc" ? "ASC" : "DESC";
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const off = Math.max(0, Number(offset) || 0);

  const rows = await query(
    `${CTE}
     SELECT
        ca.ip,
        ca.click_count,
        ca.first_click_at,
        ca.last_click_at,
        lc.affiliate_click_id AS fbclid,
        lc.transaction_id AS latest_tx,
        -- Geo from the conv report (source of truth), fall back to fuse only
        -- for visitors who clicked but never converted.
        COALESCE(cc.city, lc.click_city)        AS city,
        COALESCE(cc.region, lc.click_state)     AS state,
        COALESCE(cc.country_code, lc.click_country) AS country,
        -- Device same story: conv > fuse.
        COALESCE(cc.device_type, lc.device_type)   AS device_type,
        COALESCE(cc.brand, lc.device_brand)        AS device_brand,
        COALESCE(cc.platform, lc.device_os)        AS device_os,
        COALESCE(cc.os_version, lc.device_os_version) AS device_os_version,
        COALESCE(cc.browser, lc.browser)           AS browser,
        cc.carrier, cc.isp, cc.language,
        COALESCE(va.conv_count, 0) AS conv_count,
        COALESCE(va.conv_revenue, 0) AS conv_revenue,
        va.first_conv_at,
        va.last_conv_at,
        va.conv_events,
        -- Latency from first click → first conv (NULL if no conv).
        TIMESTAMPDIFF(MINUTE, ca.first_click_at, va.first_conv_at) AS latency_minutes
       FROM clicks_agg ca
       LEFT JOIN latest_click lc ON lc.session_ip = ca.ip
       LEFT JOIN convs_agg va ON va.ip = ca.ip
       LEFT JOIN latest_conv cc ON cc.session_user_ip = ca.ip
       ${whereSql}
       ORDER BY ${orderCol} ${orderDir}, ca.ip ASC
       LIMIT ${lim} OFFSET ${off}`,
    params,
  );

  const total = await one(
    `${CTE}
     SELECT COUNT(*) AS c
       FROM clicks_agg ca
       LEFT JOIN latest_click lc ON lc.session_ip = ca.ip
       LEFT JOIN convs_agg va ON va.ip = ca.ip
       LEFT JOIN latest_conv cc ON cc.session_user_ip = ca.ip
       ${whereSql}`,
    params,
  );

  return {
    rows: rows.map((r) => ({
      ...r,
      click_count: Number(r.click_count || 0),
      conv_count: Number(r.conv_count || 0),
      conv_revenue: Number(r.conv_revenue || 0),
    })),
    total: Number(total?.c || 0),
  };
}

export async function getJourneyByIp(ip) {
  if (!ip) return null;
  const clicks = await query(
    `SELECT * FROM journey_clicks
      WHERE session_ip = ?
      ORDER BY session_time ASC, id ASC`,
    [ip],
  );
  const convs = await query(
    `SELECT * FROM journey_conversions
      WHERE session_user_ip = ?
      ORDER BY conv_date ASC, id ASC`,
    [ip],
  );
  if (clicks.length === 0 && convs.length === 0) return null;

  // Unified chronological timeline. Each entry tagged with its origin
  // so the UI can colour clicks differently from conv events.
  const timeline = [];
  for (const c of clicks) {
    timeline.push({
      at: c.session_time,
      kind: "click",
      label: c.event_name || "CTA click",
      ip: c.session_ip,
      ua: c.browser,
      offer: c.offer_name,
      status: c.status,
      location: [c.click_city, c.click_state, c.click_country].filter(Boolean).join(", "),
      device: [c.device_brand, c.device_model, c.device_os, c.device_os_version]
        .filter(Boolean).join(" "),
      fbclid: c.affiliate_click_id,
      transaction_id: c.transaction_id,
      sourceId: `click-${c.id}`,
    });
  }
  for (const c of convs) {
    timeline.push({
      at: c.conv_date,
      kind: "conv",
      label: c.event_name || "Conversion",
      ip: c.session_user_ip,
      ua: c.user_agent,
      offer: c.offer_name,
      revenue: c.revenue,
      currency: c.currency_id,
      location: [c.city, c.region, c.country_code].filter(Boolean).join(", "),
      device: [c.brand, c.device_type, c.platform, c.os_version].filter(Boolean).join(" "),
      transaction_id: c.transaction_id,
      sourceId: `conv-${c.id}`,
    });
  }
  timeline.sort((a, b) => new Date(a.at) - new Date(b.at));

  // Profile: prefer the latest conv row (source of truth for geo + device);
  // fall back to the latest fuse click for the few unmatched visitors. We
  // also expose the fuse click separately so the UI can show fbclid.
  const latestClick = [...clicks].sort(
    (a, b) => new Date(b.session_time) - new Date(a.session_time),
  )[0];
  const latestConv = [...convs].sort(
    (a, b) => new Date(b.conv_date) - new Date(a.conv_date),
  )[0];

  const profile = latestConv
    ? {
        city: latestConv.city,
        state: latestConv.region,
        country: latestConv.country_code,
        device_type: latestConv.device_type,
        device_brand: latestConv.brand,
        device_os: latestConv.platform,
        device_os_version: latestConv.os_version,
        browser: latestConv.browser,
        language: latestConv.language,
        carrier: latestConv.carrier,
        isp: latestConv.isp,
        fbclid: latestClick?.affiliate_click_id || null,
      }
    : latestClick
      ? {
          city: latestClick.click_city,
          state: latestClick.click_state,
          country: latestClick.click_country,
          device_type: latestClick.device_type,
          device_brand: latestClick.device_brand,
          device_os: latestClick.device_os,
          device_os_version: latestClick.device_os_version,
          browser: latestClick.browser,
          carrier: latestClick.carrier,
          fbclid: latestClick.affiliate_click_id,
        }
      : null;

  const totalRevenue = convs.reduce((s, c) => s + Number(c.revenue || 0), 0);
  const distinctDevices = [
    ...new Set(convs.map((c) => c.device_type).filter(Boolean)),
  ];
  const distinctTx = [
    ...new Set(convs.map((c) => c.transaction_id).filter(Boolean)),
  ];
  const firstClickAt = clicks[0]?.session_time || null;
  const firstConvAt = convs[0]?.conv_date || null;
  const latencyMinutes =
    firstClickAt && firstConvAt
      ? Math.round((new Date(firstConvAt) - new Date(firstClickAt)) / 60000)
      : null;

  return {
    ip,
    profile,
    clicks,
    convs,
    timeline,
    totals: {
      clicks: clicks.length,
      convs: convs.length,
      revenue: totalRevenue,
      distinctTx: distinctTx.length,
      distinctDevices,
      latencyMinutes,
    },
  };
}

export async function getSummary() {
  const c1 = await one(
    `SELECT COUNT(*) AS click_count,
            COUNT(DISTINCT session_ip) AS unique_ips
       FROM journey_clicks
      WHERE session_ip IS NOT NULL`,
  );
  const c2 = await one(
    `SELECT COUNT(*) AS conv_count,
            SUM(revenue) AS revenue,
            AVG(NULLIF(delta_hours, 0)) AS avg_latency
       FROM journey_conversions`,
  );
  const matched = await one(
    `SELECT COUNT(DISTINCT session_ip) AS m
       FROM journey_clicks fc
      WHERE session_ip IS NOT NULL
        AND EXISTS (
              SELECT 1 FROM journey_conversions jc
               WHERE jc.session_user_ip = fc.session_ip
            )`,
  );
  const dailyClicks = await query(
    `SELECT DATE(session_time) AS d, COUNT(*) AS clicks
       FROM journey_clicks
      WHERE session_time IS NOT NULL
      GROUP BY DATE(session_time)
      ORDER BY d ASC`,
  );
  const dailyConvs = await query(
    `SELECT DATE(conv_date) AS d, COUNT(*) AS convs, SUM(revenue) AS revenue
       FROM journey_conversions
      WHERE conv_date IS NOT NULL
      GROUP BY DATE(conv_date)
      ORDER BY d ASC`,
  );
  const topStates = await query(
    `SELECT region AS state,
            COUNT(DISTINCT session_user_ip) AS users,
            COUNT(*) AS convs,
            COALESCE(SUM(revenue), 0) AS revenue
       FROM journey_conversions
      WHERE region IS NOT NULL AND session_user_ip IS NOT NULL
      GROUP BY region
      ORDER BY users DESC
      LIMIT 10`,
  );
  const topCities = await query(
    `SELECT CONCAT_WS(', ', city, region) AS city,
            COUNT(DISTINCT session_user_ip) AS users,
            COUNT(*) AS convs,
            COALESCE(SUM(revenue), 0) AS revenue
       FROM journey_conversions
      WHERE city IS NOT NULL AND session_user_ip IS NOT NULL
      GROUP BY city, region
      ORDER BY users DESC
      LIMIT 10`,
  );
  const topDevices = await query(
    `SELECT COALESCE(device_type, '(unknown)') AS device,
            COUNT(DISTINCT session_user_ip) AS users,
            COUNT(*) AS convs,
            COALESCE(SUM(revenue), 0) AS revenue
       FROM journey_conversions
      WHERE session_user_ip IS NOT NULL
      GROUP BY COALESCE(device_type, '(unknown)')
      ORDER BY users DESC`,
  );

  return {
    clickCount: Number(c1.click_count || 0),
    uniqueIps: Number(c1.unique_ips || 0),
    convCount: Number(c2.conv_count || 0),
    revenue: Number(c2.revenue || 0),
    avgLatencyHours: c2.avg_latency != null ? Number(c2.avg_latency) : null,
    matchedUsers: Number(matched?.m || 0),
    dailyClicks: dailyClicks.map((r) => ({
      date: String(r.d), clicks: Number(r.clicks),
    })),
    dailyConvs: dailyConvs.map((r) => ({
      date: String(r.d), convs: Number(r.convs), revenue: Number(r.revenue || 0),
    })),
    topStates: topStates.map((r) => ({
      state: r.state, users: Number(r.users),
      convs: Number(r.convs), revenue: Number(r.revenue),
    })),
    topCities: topCities.map((r) => ({
      city: r.city, users: Number(r.users),
      convs: Number(r.convs), revenue: Number(r.revenue),
    })),
    topDevices: topDevices.map((r) => ({
      device: r.device, users: Number(r.users),
      convs: Number(r.convs), revenue: Number(r.revenue),
    })),
  };
}

// One row per CONVERSION EVENT for Meta Offline Events upload.
// Joined with the earliest fuse click per IP so each event carries the
// fbclid + click time needed to build a proper `fbc` cookie value.
// Conv report is the source of truth for everything else.
export async function getOfflineEventRows() {
  return query(
    `SELECT
        jc.event_name,
        jc.conv_date         AS event_time,
        jc.revenue           AS value,
        jc.currency_id       AS currency,
        jc.transaction_id,
        jc.session_user_ip   AS ip,
        jc.user_agent,
        jc.idfa, jc.google_ad_id, jc.android_id,
        jc.city, jc.region   AS state, jc.country_code AS country,
        jc.language, jc.platform, jc.os_version, jc.device_type, jc.brand,
        fc.fbclid            AS fbclid,
        fc.click_time
       FROM journey_conversions jc
       LEFT JOIN (
         SELECT session_ip,
                affiliate_click_id AS fbclid,
                session_time       AS click_time
           FROM (
             SELECT *, ROW_NUMBER() OVER (
                         PARTITION BY session_ip
                         ORDER BY session_time ASC
                       ) AS rn
               FROM journey_clicks
              WHERE session_ip IS NOT NULL
                AND affiliate_click_id IS NOT NULL
           ) t WHERE rn = 1
       ) fc ON fc.session_ip = jc.session_user_ip
      WHERE jc.session_user_ip IS NOT NULL
        AND jc.conv_date IS NOT NULL
      ORDER BY jc.conv_date ASC`,
  );
}

// One row per unique VISITOR (session IP) for Meta Customer File upload.
// Aggregates lifetime conv stats per visitor. Use this when you want to
// build a Custom Audience directly rather than going through Offline Events.
export async function getCustomerFileRows({ onlyConverted = false } = {}) {
  return query(
    `${CTE}
     SELECT
        ca.ip,
        ca.click_count,
        ca.last_click_at,
        lc.affiliate_click_id AS fbclid,
        lc.transaction_id     AS latest_tx,
        lc.session_time       AS click_time,
        cc.user_agent,
        COALESCE(cc.city,         lc.click_city)        AS city,
        COALESCE(cc.region,       lc.click_state)       AS state,
        COALESCE(cc.country_code, lc.click_country)     AS country,
        COALESCE(cc.device_type,  lc.device_type)       AS device_type,
        cc.language, cc.idfa, cc.google_ad_id, cc.android_id,
        COALESCE(va.conv_count, 0)   AS conv_count,
        COALESCE(va.conv_revenue, 0) AS conv_revenue
       FROM clicks_agg ca
       LEFT JOIN latest_click lc ON lc.session_ip = ca.ip
       ${onlyConverted ? "INNER" : "LEFT"} JOIN convs_agg va ON va.ip = ca.ip
       LEFT JOIN latest_conv cc ON cc.session_user_ip = ca.ip
      ${onlyConverted ? "WHERE va.conv_count > 0" : ""}`,
  );
}

export async function getFacetValues() {
  // Facets come from the conv side (source of truth). The few visitors
  // without a conv match still share the same value universe.
  const countries = await query(
    "SELECT DISTINCT country_code AS v FROM journey_conversions WHERE country_code IS NOT NULL ORDER BY country_code",
  );
  const devices = await query(
    "SELECT DISTINCT device_type AS v FROM journey_conversions WHERE device_type IS NOT NULL ORDER BY device_type",
  );
  return {
    countries: countries.map((r) => r.v),
    devices: devices.map((r) => r.v),
  };
}
