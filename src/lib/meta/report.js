// Server-side report builder. Given a campaign tree (with adsets + ads +
// insights nested, as returned by /api/meta/campaigns/[id]) plus account
// metadata, produces a multi-sheet XLSX workbook with calculated insights —
// not raw data dumps.

import ExcelJS from "exceljs";
import {
  ins,
  getScore,
  getResults,
  getResultLabel,
  getPrimaryKPI,
  getObjConfig,
  scoreTier,
  isFatigued,
  rollup,
  MIN_IMPR_FOR_SIGNAL,
} from "./metrics";
import { num, int, RANGE_LABELS } from "./format";
import { isDelivering, statusInfo } from "./status";
import { reconcileSpend } from "./reconcile";
import { buildCallouts } from "./insights";

// ─── Theme ───────────────────────────────────────────────────────────────────
const COLORS = {
  ink: "FF1C1E21",
  mute: "FF65676B",
  brand: "FF1877F2",
  brandSoft: "FFEBF2FE",
  good: "FF31A24C",
  goodSoft: "FFE3F5E7",
  warn: "FFC47F00",
  warnSoft: "FFFFF4D6",
  bad: "FFE02D3C",
  badSoft: "FFFFE7E9",
  rowAlt: "FFF7F8FA",
  header: "FF1C1E21",
  headerText: "FFFFFFFF",
  section: "FFEBF2FE",
};

const TIER_FILL = {
  good: COLORS.goodSoft,
  warn: COLORS.warnSoft,
  bad: COLORS.badSoft,
};
const TIER_TEXT = {
  good: COLORS.good,
  warn: COLORS.warn,
  bad: COLORS.bad,
};

// ─── Currency format string for Excel ────────────────────────────────────────
// Excel's "currency" type wants a format string like '"$"#,##0.00'. Build one
// from any ISO currency code using Intl as a probe to find the symbol.
function buildCurrencyFormat(currency) {
  try {
    const parts = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
    }).formatToParts(0);
    const symbol = parts.find((p) => p.type === "currency")?.value || currency;
    // Some currencies print no decimals (e.g. ₹1,18,023), others do ($1.50).
    const noDecimal = ["INR", "JPY", "KRW", "VND", "IDR"];
    const fmt = noDecimal.includes(currency)
      ? `"${symbol}"#,##0;[Red]"${symbol}"-#,##0`
      : `"${symbol}"#,##0.00;[Red]"${symbol}"-#,##0.00`;
    return fmt;
  } catch {
    return `"${currency}" #,##0.00`;
  }
}

// ─── Verdict — plain-English call to action per row ──────────────────────────
function verdictFor(node, objective) {
  const score = getScore(node, objective);
  const fatigued = isFatigued(node);
  const i = ins(node);
  const spend = num(i.spend);
  const impressions = int(i.impressions);
  const results = getResults(node, objective);
  const delivering = isDelivering(node);

  if (!delivering && spend === 0) {
    return {
      verdict: "Not delivering",
      tone: "warn",
      note: "Status is not active and no spend recorded — review configuration.",
    };
  }
  if (spend === 0) {
    return {
      verdict: "Awaiting delivery",
      tone: "warn",
      note: "Active but hasn't spent yet — check audience size, schedule, and approval status.",
    };
  }
  if (impressions < MIN_IMPR_FOR_SIGNAL) {
    return {
      verdict: "Too early",
      tone: "warn",
      note: `Not enough volume (${impressions.toLocaleString("en-IN")} impressions) for reliable signal. Wait for ≥${MIN_IMPR_FOR_SIGNAL.toLocaleString()} impressions.`,
    };
  }
  if (results === 0 && spend > 500) {
    return {
      verdict: "Investigate delivery",
      tone: "bad",
      note: "Spent meaningfully but produced zero results — check creative approval, targeting, and conversion event setup.",
    };
  }
  if (fatigued) {
    return {
      verdict: "Refresh creative",
      tone: "warn",
      note: `Audience fatigue (frequency ×${num(i.frequency).toFixed(1)}) — refresh creative or expand audience.`,
    };
  }
  if (score >= 75) {
    return {
      verdict: "Scale",
      tone: "good",
      note: "Strong performance — increase budget gradually (≤20% per change) and monitor.",
    };
  }
  if (score >= 50) {
    return {
      verdict: "Maintain",
      tone: "default",
      note: "Healthy performance — keep current budget and continue monitoring.",
    };
  }
  if (score >= 25) {
    return {
      verdict: "Watch",
      tone: "warn",
      note: "Underperforming — try one creative variation or refine targeting before increasing budget.",
    };
  }
  return {
    verdict: "Reconsider",
    tone: "bad",
    note: "Poor performance — pause and review setup before continuing spend.",
  };
}

// ─── Style helpers ───────────────────────────────────────────────────────────
function applyHeaderRow(row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.headerText }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.header },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "thin", color: { argb: COLORS.mute } },
    };
  });
}

function applyVerdictCell(cell, tone) {
  const fill = TIER_FILL[tone];
  const color = TIER_TEXT[tone];
  if (fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  }
  cell.font = {
    bold: true,
    color: { argb: color || COLORS.ink },
  };
}

function bandRow(row, idx) {
  if (idx % 2 === 1) {
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.rowAlt },
      };
    });
  }
}

// ─── Sheet builders ──────────────────────────────────────────────────────────

function buildOverviewSheet(wb, ctx) {
  const { campaign, account, range, currency, currencyFmt } = ctx;
  const sheet = wb.addWorksheet("Overview", {
    properties: { tabColor: { argb: COLORS.brand } },
    views: [{ showGridLines: false }],
  });

  sheet.columns = [
    { width: 32 },
    { width: 40 },
  ];

  // Title block
  sheet.mergeCells("A1:B1");
  const title = sheet.getCell("A1");
  title.value = campaign.name;
  title.font = { size: 18, bold: true, color: { argb: COLORS.ink } };
  title.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 28;

  sheet.mergeCells("A2:B2");
  const sub = sheet.getCell("A2");
  const rangeLabel =
    range.kind === "custom"
      ? `${range.since} → ${range.until}`
      : RANGE_LABELS[range.preset] || range.preset;
  sub.value = `Campaign report · ${rangeLabel} · Generated ${new Date().toLocaleString("en-IN")}`;
  sub.font = { size: 10, color: { argb: COLORS.mute } };

  const objConf = getObjConfig(campaign.objective);
  const score = getScore(campaign);
  const tier = scoreTier(score);
  const kpi = getPrimaryKPI(campaign);
  const results = getResults(campaign);
  const status = statusInfo(campaign);
  const i = ins(campaign);
  const fatigued = isFatigued(campaign);

  let r = 4;
  const section = (label) => {
    sheet.mergeCells(`A${r}:B${r}`);
    const c = sheet.getCell(`A${r}`);
    c.value = label;
    c.font = { bold: true, size: 11, color: { argb: COLORS.brand } };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.section },
    };
    c.alignment = { vertical: "middle" };
    sheet.getRow(r).height = 22;
    r++;
  };

  const kv = (k, v, opts = {}) => {
    const row = sheet.getRow(r);
    row.getCell(1).value = k;
    row.getCell(1).font = { color: { argb: COLORS.mute }, size: 10 };
    const cell = row.getCell(2);
    cell.value = v;
    cell.font = {
      bold: opts.bold ?? false,
      color: { argb: opts.color || COLORS.ink },
      size: 11,
    };
    if (opts.numFmt) cell.numFmt = opts.numFmt;
    if (opts.fill) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: opts.fill },
      };
    }
    r++;
  };

  section("Account");
  kv("Ad account", account?.name || "—");
  kv("Account ID", account?.id || "—");
  kv("Currency", currency);
  if (account?.timezone) kv("Timezone", account.timezone);

  r++;
  section("Campaign");
  kv("Objective", objConf?.label || campaign.objective);
  kv("Status", status.label);
  kv(
    "Created",
    campaign.created_time ? new Date(campaign.created_time) : "—",
    { numFmt: "yyyy-mm-dd" },
  );
  kv(
    "Date range",
    `${rangeLabel}${i.date_start ? ` (${i.date_start} → ${i.date_stop})` : ""}`,
  );
  kv("Health score", `${score} / 100 · ${tier.label}`, {
    bold: true,
    color: TIER_TEXT[tier.tone],
    fill: TIER_FILL[tier.tone],
  });

  r++;
  section("Performance — totals");
  kv("Spend", num(i.spend), { numFmt: currencyFmt, bold: true });
  kv(getResultLabel(campaign.objective), results, { numFmt: "#,##0" });
  if (kpi.raw != null) {
    kv(`${kpi.label} (cost per result)`, kpi.raw, {
      numFmt: currencyFmt,
      bold: true,
      color: COLORS.brand,
    });
  } else {
    kv(`${kpi.label} (cost per result)`, "—");
  }
  kv("Reach (unique people)", int(i.reach), { numFmt: "#,##0" });
  kv("Impressions", int(i.impressions), { numFmt: "#,##0" });
  kv("Clicks", int(i.clicks), { numFmt: "#,##0" });

  r++;
  section("Performance — ratios");
  kv("Click-through rate (CTR)", num(i.ctr) / 100, { numFmt: "0.00%" });
  kv("Cost per 1,000 impressions (CPM)", num(i.cpm), { numFmt: currencyFmt });
  kv("Cost per click (CPC)", num(i.cpc), { numFmt: currencyFmt });
  kv("Frequency (impressions per person)", num(i.frequency), {
    numFmt: '0.00"×"',
    color: fatigued ? COLORS.warn : COLORS.ink,
    bold: fatigued,
  });

  r++;
  section("Verdict");
  const v = verdictFor(campaign);
  kv("Recommendation", v.verdict, {
    bold: true,
    color: TIER_TEXT[v.tone] || COLORS.ink,
    fill: TIER_FILL[v.tone],
  });
  sheet.mergeCells(`A${r}:B${r}`);
  const note = sheet.getCell(`A${r}`);
  note.value = v.note;
  note.font = { size: 10, color: { argb: COLORS.mute }, italic: true };
  note.alignment = { wrapText: true, vertical: "top" };
  sheet.getRow(r).height = 36;

  return sheet;
}

function buildTableSheet(wb, name, columns, rows, ctx) {
  const sheet = wb.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  sheet.columns = columns.map((c) => ({ width: c.width }));
  const header = sheet.addRow(columns.map((c) => c.label));
  applyHeaderRow(header);

  rows.forEach((row, idx) => {
    const r = sheet.addRow(columns.map((c) => row[c.key] ?? ""));
    columns.forEach((c, ci) => {
      const cell = r.getCell(ci + 1);
      if (c.numFmt) cell.numFmt = c.numFmt;
      if (c.align) cell.alignment = { horizontal: c.align, vertical: "middle" };
      if (c.key === "verdict") {
        applyVerdictCell(cell, row._verdictTone);
      }
      if (c.key === "score" && typeof row.score === "number") {
        cell.font = {
          bold: true,
          color: { argb: TIER_TEXT[scoreTier(row.score).tone] || COLORS.ink },
        };
      }
      if (c.key === "fatigue" && row.fatigue === "Yes") {
        cell.font = { bold: true, color: { argb: COLORS.warn } };
      }
    });
    bandRow(r, idx);
  });

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  // Totals row
  if (ctx?.totals) {
    const totalRow = sheet.addRow(
      columns.map((c) => ctx.totals[c.key] ?? ""),
    );
    totalRow.eachCell((cell, ci) => {
      cell.font = { bold: true, color: { argb: COLORS.ink } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.brandSoft },
      };
      const c = columns[ci - 1];
      if (c?.numFmt) cell.numFmt = c.numFmt;
    });
  }

  return sheet;
}

function buildAdsetsSheet(wb, ctx) {
  const { campaign, currencyFmt } = ctx;
  const objective = campaign.objective;
  const adsets = campaign.adsets?.data || [];

  const columns = [
    { key: "rank", label: "#", width: 5, align: "center" },
    { key: "name", label: "Ad set name", width: 40 },
    { key: "status", label: "Status", width: 14 },
    { key: "score", label: "Score", width: 8, align: "center" },
    { key: "tier", label: "Tier", width: 12 },
    { key: "spend", label: "Spend", width: 14, numFmt: currencyFmt },
    { key: "share", label: "% of spend", width: 11, numFmt: "0.0%" },
    { key: "resultsLabel", label: "Result type", width: 14 },
    { key: "results", label: "Results", width: 10, numFmt: "#,##0" },
    {
      key: "kpiLabel",
      label: "KPI",
      width: 8,
      align: "center",
    },
    { key: "kpiValue", label: "Cost per result", width: 15, numFmt: currencyFmt },
    { key: "ctr", label: "CTR", width: 9, numFmt: "0.00%" },
    { key: "cpm", label: "CPM", width: 12, numFmt: currencyFmt },
    { key: "cpc", label: "CPC", width: 12, numFmt: currencyFmt },
    { key: "reach", label: "Reach", width: 12, numFmt: "#,##0" },
    { key: "impressions", label: "Impressions", width: 14, numFmt: "#,##0" },
    { key: "clicks", label: "Clicks", width: 11, numFmt: "#,##0" },
    {
      key: "frequency",
      label: "Frequency",
      width: 11,
      numFmt: '0.00"×"',
    },
    { key: "fatigue", label: "Fatigue", width: 9, align: "center" },
    { key: "ads", label: "# Ads", width: 7, align: "center" },
    { key: "verdict", label: "Verdict", width: 20 },
    { key: "note", label: "What to do", width: 60 },
  ];

  const campaignSpend = num(ins(campaign).spend);
  const ranked = [...adsets]
    .map((a) => ({ a, score: getScore(a, objective) }))
    .sort((x, y) => y.score - x.score);

  const rows = ranked.map(({ a, score }, idx) => {
    const i = ins(a);
    const kpi = getPrimaryKPI(a, objective);
    const tier = scoreTier(score);
    const v = verdictFor(a, objective);
    const spend = num(i.spend);
    return {
      rank: idx + 1,
      name: a.name,
      status: statusInfo(a).label,
      score,
      tier: tier.label,
      spend,
      share: campaignSpend > 0 ? spend / campaignSpend : 0,
      resultsLabel: getResultLabel(objective),
      results: getResults(a, objective),
      kpiLabel: kpi.label,
      kpiValue: kpi.raw,
      ctr: num(i.ctr) / 100,
      cpm: num(i.cpm),
      cpc: num(i.cpc),
      reach: int(i.reach),
      impressions: int(i.impressions),
      clicks: int(i.clicks),
      frequency: num(i.frequency),
      fatigue: isFatigued(a) ? "Yes" : "No",
      ads: a.ads?.data?.length || 0,
      verdict: v.verdict,
      note: v.note,
      _verdictTone: v.tone,
    };
  });

  const totals = rollup(adsets, objective);
  const totalsRow = {
    rank: "",
    name: `TOTAL · ${adsets.length} ad sets`,
    status: "",
    score: "",
    tier: "",
    spend: totals.spend,
    share: 1,
    resultsLabel: "",
    results: totals.results,
    kpiLabel: "",
    kpiValue: "",
    ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
    cpm: totals.cpm,
    cpc: totals.cpc,
    reach: totals.reach,
    impressions: totals.impressions,
    clicks: totals.clicks,
    frequency: "",
    fatigue: "",
    ads: rows.reduce((s, r) => s + r.ads, 0),
    verdict: "",
    note: "",
  };

  return buildTableSheet(wb, "Ad Sets", columns, rows, { totals: totalsRow });
}

function buildAdsSheet(wb, ctx) {
  const { campaign, currencyFmt } = ctx;
  const objective = campaign.objective;
  const adsets = campaign.adsets?.data || [];
  const allAds = adsets.flatMap((a) =>
    (a.ads?.data || []).map((ad) => ({ ad, adset: a })),
  );

  const columns = [
    { key: "rank", label: "#", width: 5, align: "center" },
    { key: "name", label: "Ad name", width: 38 },
    { key: "adset", label: "Inside ad set", width: 32 },
    { key: "status", label: "Status", width: 14 },
    { key: "score", label: "Score", width: 8, align: "center" },
    { key: "spend", label: "Spend", width: 14, numFmt: currencyFmt },
    { key: "results", label: "Results", width: 10, numFmt: "#,##0" },
    { key: "kpiValue", label: "Cost per result", width: 15, numFmt: currencyFmt },
    { key: "ctr", label: "CTR", width: 9, numFmt: "0.00%" },
    { key: "cpm", label: "CPM", width: 12, numFmt: currencyFmt },
    { key: "cpc", label: "CPC", width: 12, numFmt: currencyFmt },
    { key: "reach", label: "Reach", width: 12, numFmt: "#,##0" },
    { key: "impressions", label: "Impressions", width: 14, numFmt: "#,##0" },
    { key: "clicks", label: "Clicks", width: 11, numFmt: "#,##0" },
    {
      key: "frequency",
      label: "Frequency",
      width: 11,
      numFmt: '0.00"×"',
    },
    { key: "verdict", label: "Verdict", width: 20 },
  ];

  const ranked = allAds
    .map(({ ad, adset }) => ({ ad, adset, score: getScore(ad, objective) }))
    .sort((x, y) => y.score - x.score);

  const rows = ranked.map(({ ad, adset, score }, idx) => {
    const i = ins(ad);
    const kpi = getPrimaryKPI(ad, objective);
    const v = verdictFor(ad, objective);
    return {
      rank: idx + 1,
      name: ad.name,
      adset: adset.name,
      status: statusInfo(ad).label,
      score,
      spend: num(i.spend),
      results: getResults(ad, objective),
      kpiValue: kpi.raw,
      ctr: num(i.ctr) / 100,
      cpm: num(i.cpm),
      cpc: num(i.cpc),
      reach: int(i.reach),
      impressions: int(i.impressions),
      clicks: int(i.clicks),
      frequency: num(i.frequency),
      verdict: v.verdict,
      _verdictTone: v.tone,
    };
  });

  return buildTableSheet(wb, "Ads", columns, rows);
}

function buildActionsSheet(wb, ctx) {
  const { campaign, currencyFmt } = ctx;
  const objective = campaign.objective;
  const adsets = campaign.adsets?.data || [];

  const rows = [];
  const pushFor = (level, ownerName, ownerId, node) => {
    const acts = ins(node).actions || [];
    const cpa = ins(node).cost_per_action_type || [];
    const cpaMap = Object.fromEntries(
      cpa.map((c) => [c.action_type, num(c.value)]),
    );
    acts.forEach((a) => {
      rows.push({
        level,
        ownerName,
        ownerId,
        type: a.action_type,
        count: int(a.value),
        costPerAction: cpaMap[a.action_type] ?? null,
      });
    });
  };

  pushFor("Campaign", campaign.name, campaign.id, campaign);
  adsets.forEach((a) => {
    pushFor("Ad set", a.name, a.id, a);
    (a.ads?.data || []).forEach((ad) =>
      pushFor("Ad", ad.name, ad.id, ad),
    );
  });

  const columns = [
    { key: "level", label: "Level", width: 10 },
    { key: "ownerName", label: "Name", width: 38 },
    { key: "ownerId", label: "ID", width: 18 },
    { key: "type", label: "Action type", width: 30 },
    { key: "count", label: "Count", width: 10, numFmt: "#,##0" },
    {
      key: "costPerAction",
      label: "Cost per action",
      width: 15,
      numFmt: currencyFmt,
    },
  ];

  return buildTableSheet(wb, "Action Breakdown", columns, rows);
}

function buildRecommendationsSheet(wb, ctx) {
  const { campaign } = ctx;
  const objective = campaign.objective;
  const adsets = campaign.adsets?.data || [];
  const ads = adsets.flatMap((a) => a.ads?.data || []);

  const sheet = wb.addWorksheet("Recommendations", {
    views: [{ showGridLines: false }],
  });
  sheet.columns = [
    { width: 4 },
    { width: 14 },
    { width: 90 },
  ];

  let r = 1;
  sheet.mergeCells(`A${r}:C${r}`);
  const title = sheet.getCell(`A${r}`);
  title.value = "What to do next";
  title.font = { size: 16, bold: true, color: { argb: COLORS.ink } };
  sheet.getRow(r).height = 26;
  r++;
  sheet.mergeCells(`A${r}:C${r}`);
  const sub = sheet.getCell(`A${r}`);
  sub.value =
    "Plain-English actions derived from the data. Sorted by impact — start at the top.";
  sub.font = { size: 10, color: { argb: COLORS.mute }, italic: true };
  r += 2;

  let idx = 1;
  const add = (tone, text) => {
    const row = sheet.getRow(r);
    row.getCell(1).value = idx++;
    row.getCell(1).alignment = { horizontal: "right", vertical: "top" };
    row.getCell(1).font = { color: { argb: COLORS.mute }, bold: true };

    const toneLabel = {
      good: "OPPORTUNITY",
      warn: "WATCH",
      bad: "URGENT",
      info: "NOTE",
    }[tone];
    const toneCell = row.getCell(2);
    toneCell.value = toneLabel;
    toneCell.font = {
      bold: true,
      color: { argb: TIER_TEXT[tone] || COLORS.brand },
    };
    toneCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: TIER_FILL[tone] || COLORS.brandSoft },
    };
    toneCell.alignment = { vertical: "top" };

    const textCell = row.getCell(3);
    textCell.value = text;
    textCell.alignment = { wrapText: true, vertical: "top" };
    textCell.font = { color: { argb: COLORS.ink }, size: 11 };

    row.height = Math.max(22, Math.ceil(text.length / 90) * 18);
    r++;
  };

  // Reconciliation check first
  if (adsets.length > 0) {
    const recon = reconcileSpend(campaign, adsets);
    if (!recon.matches) {
      add(
        "bad",
        `Spend reconciliation: campaign reports ${recon.parentSpend.toFixed(2)} but the sum of its ${adsets.length} ad sets is ${recon.childSpend.toFixed(2)} (difference ${Math.abs(recon.diff).toFixed(2)}). Investigate before basing decisions on either figure.`,
      );
    }
  }

  // Campaign-level callouts
  buildCallouts(adsets, objective).forEach((c) => add(c.tone, c.text));

  // Ad-level callouts (within the campaign)
  if (ads.length > 0) {
    const adCallouts = buildCallouts(ads, objective);
    if (adCallouts.length > 0) {
      sheet.mergeCells(`A${r}:C${r}`);
      const head = sheet.getCell(`A${r}`);
      head.value = "Creative-level signals";
      head.font = { bold: true, color: { argb: COLORS.brand }, size: 11 };
      head.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.section },
      };
      sheet.getRow(r).height = 22;
      r++;
      adCallouts.forEach((c) => add(c.tone, c.text));
    }
  }

  // Per-adset specific notes (only meaningful ones)
  const adsetNotes = adsets
    .map((a) => ({ a, v: verdictFor(a, objective) }))
    .filter(({ v }) => v.tone === "bad" || v.tone === "warn" || v.tone === "good")
    .filter(({ v }) =>
      ["Scale", "Refresh creative", "Investigate delivery", "Reconsider"].includes(
        v.verdict,
      ),
    );
  if (adsetNotes.length > 0) {
    sheet.mergeCells(`A${r}:C${r}`);
    const head = sheet.getCell(`A${r}`);
    head.value = "Per-ad-set actions";
    head.font = { bold: true, color: { argb: COLORS.brand }, size: 11 };
    head.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.section },
    };
    sheet.getRow(r).height = 22;
    r++;
    adsetNotes.forEach(({ a, v }) =>
      add(v.tone, `"${a.name}" → ${v.verdict}: ${v.note}`),
    );
  }

  if (idx === 1) {
    add("info", "No urgent actions detected. Everything is within healthy ranges for this date range.");
  }

  return sheet;
}

// ─── Public entrypoint ───────────────────────────────────────────────────────
export async function buildCampaignReport({ campaign, account, range }) {
  const currency = account?.currency || "USD";
  const currencyFmt = buildCurrencyFormat(currency);
  const ctx = { campaign, account, range, currency, currencyFmt };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Meta Ads Analytics";
  wb.created = new Date();

  buildOverviewSheet(wb, ctx);
  buildAdsetsSheet(wb, ctx);
  buildAdsSheet(wb, ctx);
  buildActionsSheet(wb, ctx);
  buildRecommendationsSheet(wb, ctx);

  return wb;
}

export function sanitizeFilename(s) {
  return (s || "campaign")
    .replace(/[^A-Za-z0-9 \-_]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}
