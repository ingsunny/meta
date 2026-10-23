// Single source of truth for "is this thing actually running" and
// for the human-readable status label. Meta returns BOTH `status`
// (what the user configured) and `effective_status` (the real state).
// We always prefer effective_status — that's the truth.

export function liveStatus(node) {
  return node?.effective_status || node?.status || "UNKNOWN";
}

export function isDelivering(node) {
  return liveStatus(node) === "ACTIVE";
}

// Map every Meta effective_status value to a label + tone.
// Reference: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/
const STATUS_MAP = {
  ACTIVE: { label: "Active", tone: "good" },
  PAUSED: { label: "Paused", tone: "neutral" },
  CAMPAIGN_PAUSED: { label: "Paused · campaign", tone: "neutral" },
  ADSET_PAUSED: { label: "Paused · ad set", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
  DELETED: { label: "Deleted", tone: "bad" },
  PENDING_REVIEW: { label: "In review", tone: "warn" },
  PREAPPROVED: { label: "In review", tone: "warn" },
  IN_PROCESS: { label: "Processing", tone: "warn" },
  WITH_ISSUES: { label: "Has issues", tone: "warn" },
  DISAPPROVED: { label: "Rejected", tone: "bad" },
  PENDING_BILLING_INFO: { label: "Billing pending", tone: "warn" },
  UNKNOWN: { label: "Unknown", tone: "neutral" },
};

export function statusInfo(node) {
  const key = liveStatus(node);
  return STATUS_MAP[key] || { label: key, tone: "neutral" };
}
