# Product v2 plan

Branch: `product-v2`

Goal: turn the internal single-user dashboard into a real multi-user product.
You land on a login screen, sign up or log in, pick a tool, and each user only ever sees their own data and their own connected Meta accounts.

## 1. What changes

| Area | Today | v2 |
|---|---|---|
| Entry | Hardcoded passcode, then a workspace picker | `/login` and `/signup` only. Nothing else is reachable signed out |
| Users | None (everyone is "Sunny") | `users` table, scrypt-hashed passwords, DB-backed sessions |
| Meta access | One `FB_TOKEN` + `AD_ACCOUNT_ID` in `.env.local` | Each user connects their own Meta. Token stored encrypted per user. Ad accounts discovered via `/me/adaccounts` |
| Navigation | Pill switcher across 5 sections | Left sidebar product shell: Home · Ads Manager · Analytics · Reports · Integrations · Settings |
| Data ownership | Global | Every analytics campaign and report belongs to a user (`user_id`) |
| Sections | Meta, Analytics, Tracker, Journey, CAPI | Ads Manager, Analytics, **Reports (new)**. Tracker, Journey, CAPI archived |

## 2. Product structure

```
/login            sign in
/signup           create account
/home             launcher: greeting, tools, connection status, recent reports
/meta             Ads Manager (existing pages, now per-user token + accounts)
/analytics        conversion analytics (existing, now scoped per user)
/reports          NEW: upload any Meta export (.xlsx / .csv) → instant report
/reports/[id]     the report itself
/integrations     connect Meta (OAuth when app is configured, or paste a token)
/settings         profile, password, sign out
```

"Integrations" is built as a list of providers, not a Meta-only screen. Meta is the first provider; Google Ads, TikTok and others slot in later without changing the shell.

## 3. Database

New tables (all `CREATE IF NOT EXISTS`, run with `npm run db:init`):

- `users`: id, email (unique), name, password_hash, created_at, last_login_at
- `sessions`: id (random 32-byte hash), user_id, expires_at, user_agent, ip. Cookie holds the raw token, DB holds its SHA-256, so a DB leak can't be replayed
- `integrations`: user_id, provider (`meta`, later `google`, …), external_user_id, external_name, access_token_enc (AES-256-GCM), token_expires_at, scopes, status, connected_at. Unique on (user_id, provider)
- `integration_accounts`: the ad accounts discovered for a connection (id, name, currency, status, timezone), so pickers load without hitting Meta every page view
- `reports`, `report_rows`: uploaded report file meta, detected columns, and rows as JSON
- `analytics_campaigns` gains `user_id`

## 4. Reports (new, independent)

- Upload `.xlsx`, `.xls`-converted `.csv`, or `.csv` exported from Meta Ads Manager (or any tabular file)
- Auto-detects columns: dimension columns (Campaign name, Ad set name, Ad name, Day, Age, Gender, Placement…) vs metric columns (Amount spent, Impressions, Reach, Link clicks, Results, CPM, CTR, Cost per result…), with Meta's naming variants
- Report view: KPI strip (spend, impressions, reach, clicks, results, derived CTR / CPC / CPM / CPR), trend chart if there is a date column, top-N bar chart, full sortable/searchable table, group-by any dimension, export back to CSV
- Doesn't need a Meta connection

## 5. Design direction

- **Feel:** calm and editorial, like a modern finance tool. Quiet surfaces, strong type, color only where it means something
- **Theme:** warm paper neutrals (`#f6f5f1` canvas, white cards, ink `#14161a`), with one accent of deep indigo (`#4338ca` → `#6366f1`). Semantic green / amber / red unchanged. No Facebook blue, since the product is multi-provider
- **Type:** Geist for UI, Geist Mono for numbers, Instrument Serif for display headlines (login hero, page greetings)
- **Texture:** a subtle SVG noise grain over the canvas, a dot grid behind the auth hero, and soft indigo radial glows. All inline CSS/SVG, no image files
- **Imagery:** no stock photos. The auth hero is a composed "product preview" built from real UI pieces (floating KPI card, mini sparkline, report row) drawn in code
- **Shell:** collapsible left sidebar, slim top bar with page title, account switcher (where relevant), date range, user menu

## 6. Archive

Moved to `archive/` (outside the Next.js app, so not built or routed): `capi`, `journey`, `tracker` pages, their API routes and libs, and the root `capi/` and `fuseclick/` scripts. Nothing is deleted. The schema keeps their tables so data isn't lost.

## 7. Not tied to any one offer

The "Medicare" example placeholder and other offer-specific copy is replaced with neutral examples. No feature depends on a specific vertical.

## 8. Local dev

The system MySQL rejected root without a password, so v2 runs on a dedicated container: `toosio-mysql` (MySQL 8.4, `127.0.0.1:3307`, database `toosio`, volume `toosio-mysql-data`). `.env.local` points to it. The original `.env.local` was backed up before editing.

## 9. Order of work

1. Archive, retheme, fonts
2. Schema + auth (lib, API, proxy, login/signup pages)
3. App shell + Home
4. Per-user Meta integration (connect, accounts, refactor `/api/meta/*` off `FB_TOKEN`)
5. Scope analytics by user
6. Reports module
7. Build, run, smoke-test signup → login → each tool
