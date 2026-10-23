# Toosio

Ads, analytics and reporting for every ad account you run. Multi-user: each person signs up, connects their own Meta login (read-only), and sees only their own data.

| Tool | What it does | Needs Meta? |
|---|---|---|
| **Ads Manager** | Campaigns, ad sets, ads, breakdowns, creative previews across every Meta ad account the user can access | Yes |
| **Analytics** | Upload conversion CSVs from your tracker; funnel, geo, device, quality, forecast, match against Meta spend | Optional |
| **Reports** | Upload any Meta Ads Manager export (.xlsx / .csv) or other spreadsheet → KPIs, trend, top-N, grouped table, CSV export | No |

Archived (not built): CAPI sender, Journey, Tracker. See [archive/README.md](archive/README.md).

## Setup

1. **MySQL 8.** Any instance works. For local dev:

   ```bash
   docker run -d --name toosio-mysql --restart unless-stopped \
     -e MYSQL_ROOT_PASSWORD=<password> -e MYSQL_DATABASE=toosio \
     -p 127.0.0.1:3307:3306 -v toosio-mysql-data:/var/lib/mysql mysql:8.4
   ```

2. **`.env.local`**

   ```bash
   DB_HOST=127.0.0.1
   DB_PORT=3307
   DB_USER=root
   DB_PASSWORD=<password>
   DB_NAME=toosio

   TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>   # encrypts stored Meta tokens; don't change once users connect

   # Facebook Login (optional until your Meta app is set up)
   FB_APP_ID=
   FB_APP_SECRET=
   APP_URL=http://localhost:3055
   ```

3. **Install, create tables, run**

   ```bash
   npm install
   npm run db:init
   npm run dev        # http://localhost:3055
   ```

   On Linux, if the build fails with `Cannot find module '@tailwindcss/oxide-linux-x64-gnu'`, the lockfile came from another OS: `npm i --no-save @tailwindcss/oxide-linux-x64-gnu`.

## Connecting Meta

Users connect from **Integrations**:

- **Continue with Facebook** (OAuth). Appears once `FB_APP_ID` / `FB_APP_SECRET` are set. Requests `ads_read` + `business_management` only, so the app can't change anything in Meta. Redirect URI: `${APP_URL}/api/integrations/meta/callback`. Going public needs Meta App Review; see [docs/facebook-login-multi-user.md](docs/facebook-login-multi-user.md).
- **Paste an access token.** Always available. Useful in dev and before App Review.

Tokens are AES-256-GCM encrypted at rest and never sent to the browser.

## How auth works

- Email + password, hashed with scrypt.
- Sessions live in the `sessions` table; the cookie holds a random token and the DB stores only its SHA-256.
- `src/proxy.js` redirects signed-out requests to `/login`; every layout and API route re-validates the session against the DB.
- Analytics campaigns and reports are scoped by `user_id` in the storage layer.

## Layout

```
src/app/(auth)/        login, signup
src/app/(app)/         home, meta (Ads Manager), analytics, reports, integrations, settings
src/app/api/           auth, account, integrations/meta, meta/*, analytics/*, reports/*
src/lib/auth/          sessions, password hashing, token encryption
src/lib/integrations/  per-user Meta connection
src/lib/reports/       file parsing, column detection, aggregation
```
