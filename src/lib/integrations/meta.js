// Server-only Meta integration. Each user connects their own Meta login —
// via Facebook Login (OAuth) when FB_APP_ID/FB_APP_SECRET are set, or by
// pasting an access token (handy in dev and before App Review). The token
// is stored encrypted; the ad accounts it can see are cached in
// integration_accounts so pages don't hit Meta just to render a picker.
//
// Permissions requested are read-only: ads_read (+ business_management so
// Business-Manager-owned accounts are listed). We never ask for
// ads_management, so the app cannot change anything in Meta.

import axios from "axios";
import { query, one, exec } from "@/lib/db";
import { newId, encryptSecret, decryptSecret, toSqlDate } from "@/lib/auth/crypto";

export const META_API_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;
export const META_SCOPES = ["ads_read", "business_management"];

export function oauthConfigured() {
  return Boolean(process.env.FB_APP_ID && process.env.FB_APP_SECRET);
}

function appUrl() {
  return (process.env.APP_URL || "http://localhost:3055").replace(/\/$/, "");
}

export function redirectUri() {
  return `${appUrl()}/api/integrations/meta/callback`;
}

export function buildAuthUrl(state) {
  const sp = new URLSearchParams({
    client_id: process.env.FB_APP_ID,
    redirect_uri: redirectUri(),
    state,
    scope: META_SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${sp}`;
}

// code → short-lived user token → long-lived (~60 day) token.
export async function exchangeCode(code) {
  const short = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      client_id: process.env.FB_APP_ID,
      client_secret: process.env.FB_APP_SECRET,
      redirect_uri: redirectUri(),
      code,
    },
  });
  const long = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: process.env.FB_APP_ID,
      client_secret: process.env.FB_APP_SECRET,
      fb_exchange_token: short.data.access_token,
    },
  });
  return {
    token: long.data.access_token,
    expiresIn: long.data.expires_in || null,
  };
}

export function graphErrorMessage(error) {
  const e = error?.response?.data?.error;
  if (!e) return error?.message || "Meta request failed";
  if (e.code === 190) return "Your Meta session expired or was revoked. Reconnect Meta to continue.";
  return e.error_user_msg || e.message || "Meta request failed";
}

async function fetchAllAdAccounts(token) {
  const out = [];
  let url = `${GRAPH}/me/adaccounts`;
  let params = {
    fields: "id,name,currency,account_status,timezone_name,business{name}",
    limit: 200,
    access_token: token,
  };
  // Follow paging cursors; cap at 10 pages (2,000 accounts) as a safety net.
  for (let i = 0; i < 10 && url; i++) {
    const res = await axios.get(url, { params });
    out.push(...(res.data.data || []));
    url = res.data.paging?.next || null;
    params = undefined;
  }
  return out;
}

async function saveAccounts(integrationId, accounts) {
  await exec(`DELETE FROM integration_accounts WHERE integration_id = ?`, [integrationId]);
  for (const a of accounts) {
    await exec(
      `INSERT INTO integration_accounts
         (integration_id, account_id, name, currency, timezone, account_status, business_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        integrationId,
        a.id,
        a.name || a.id,
        a.currency || "USD",
        a.timezone_name || null,
        a.account_status ?? null,
        a.business?.name || null,
      ],
    );
  }
  await exec(`UPDATE integrations SET synced_at = ?, status = 'active' WHERE id = ?`, [toSqlDate(), integrationId]);
}

// Validates the token, upserts the integration row, and syncs ad accounts.
export async function connectMeta(userId, { token, expiresIn = null, method = "oauth" }) {
  const me = await axios.get(`${GRAPH}/me`, { params: { fields: "id,name", access_token: token } });
  const existing = await one(`SELECT id FROM integrations WHERE user_id = ? AND provider = 'meta'`, [userId]);
  const id = existing?.id || newId();
  const expiresAt = expiresIn ? toSqlDate(Date.now() + expiresIn * 1000) : null;

  await exec(
    `INSERT INTO integrations
       (id, user_id, provider, external_user_id, external_name, access_token_enc,
        token_expires_at, scopes, method, status, connected_at)
     VALUES (?, ?, 'meta', ?, ?, ?, ?, ?, ?, 'active', ?)
     ON DUPLICATE KEY UPDATE
       external_user_id = VALUES(external_user_id),
       external_name = VALUES(external_name),
       access_token_enc = VALUES(access_token_enc),
       token_expires_at = VALUES(token_expires_at),
       scopes = VALUES(scopes),
       method = VALUES(method),
       status = 'active',
       connected_at = VALUES(connected_at)`,
    [id, userId, me.data.id, me.data.name, encryptSecret(token), expiresAt, META_SCOPES.join(","), method, toSqlDate()],
  );

  await saveAccounts(id, await fetchAllAdAccounts(token));
  return getMetaIntegration(userId);
}

export async function syncMetaAccounts(userId) {
  const row = await one(`SELECT * FROM integrations WHERE user_id = ? AND provider = 'meta'`, [userId]);
  if (!row) return null;
  try {
    await saveAccounts(row.id, await fetchAllAdAccounts(decryptSecret(row.access_token_enc)));
  } catch (e) {
    if (e?.response?.data?.error?.code === 190) {
      await exec(`UPDATE integrations SET status = 'expired' WHERE id = ?`, [row.id]);
    }
    throw e;
  }
  return getMetaIntegration(userId);
}

export async function disconnectMeta(userId) {
  await exec(`DELETE FROM integrations WHERE user_id = ? AND provider = 'meta'`, [userId]);
}

// Public-safe view of the connection (never includes the token).
export async function getMetaIntegration(userId) {
  const row = await one(
    `SELECT id, external_user_id, external_name, token_expires_at, scopes, method, status, connected_at, synced_at
       FROM integrations WHERE user_id = ? AND provider = 'meta'`,
    [userId],
  );
  if (!row) return null;
  const accounts = await query(
    `SELECT account_id AS id, name, currency, timezone, account_status, business_name
       FROM integration_accounts WHERE integration_id = ? ORDER BY name`,
    [row.id],
  );
  return { ...row, accounts };
}

export async function getMetaTokenForUser(userId) {
  const row = await one(
    `SELECT access_token_enc FROM integrations WHERE user_id = ? AND provider = 'meta' AND status = 'active'`,
    [userId],
  );
  return row ? decryptSecret(row.access_token_enc) : null;
}

// Meta account_status codes → label used across the UI.
export function accountStatusLabel(code) {
  return (
    {
      1: "Active",
      2: "Disabled",
      3: "Unsettled",
      7: "Pending review",
      8: "Pending settlement",
      9: "In grace period",
      100: "Pending closure",
      101: "Closed",
    }[code] || "Unknown"
  );
}
