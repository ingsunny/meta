// Single source of truth for Meta date_preset vs custom time_range. Both
// /api/meta/campaigns* and the report builder need to switch between
// `insights.date_preset(...)` and `insights.time_range({...})` based on
// whether the user picked a preset or a custom from→to range.

export const VALID_PRESETS = new Set([
  "today",
  "yesterday",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "last_90d",
  "maximum",
]);

// YYYY-MM-DD format Meta accepts
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(d) {
  return typeof d === "string" && DATE_RE.test(d);
}

// Returns a normalized range descriptor we use throughout the server.
// {kind: 'preset', preset: 'last_30d'} or {kind: 'custom', since, until}
export function resolveRange(searchParams) {
  const range = searchParams.get("range") || "maximum";
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  if (range === "custom" && isValidDate(since) && isValidDate(until)) {
    return { kind: "custom", since, until, label: `${since} → ${until}` };
  }
  const preset = VALID_PRESETS.has(range) ? range : "maximum";
  return { kind: "preset", preset, label: preset };
}

// Build the bit that goes after `insights.` in a Graph API field expansion:
//   date_preset(last_7d)
//   time_range({'since':'2024-01-01','until':'2024-01-31'})
export function insightsModifier(range) {
  if (range.kind === "custom") {
    return `time_range({'since':'${range.since}','until':'${range.until}'})`;
  }
  return `date_preset(${range.preset})`;
}

// Build params object for a standalone insights call (e.g. breakdown endpoint).
export function insightsQueryParams(range) {
  if (range.kind === "custom") {
    return { time_range: JSON.stringify({ since: range.since, until: range.until }) };
  }
  return { date_preset: range.preset };
}
