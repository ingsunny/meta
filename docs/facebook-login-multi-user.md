# Let any user log in with Facebook and see their own ad data (read-only)

**Short answer: yes, this is possible.** It's the standard way Meta-connected SaaS tools work (Madgicx, Supermetrics, Triple Whale, etc.).
Users click "Continue with Facebook", approve read access once, and your app can then list their ad accounts and pull insights without them visiting Meta again.

## How it differs from today

| | Today (dev) | Multi-user app |
|---|---|---|
| Token | One `FB_TOKEN` in `.env.local` | One token **per user**, stored in a database |
| Ad account | One `AD_ACCOUNT_ID` in `.env.local` | Fetched per user from `/me/adaccounts` |
| Login | Hardcoded passcode | "Continue with Facebook" (OAuth) |
| Who owns the data | You | Each user sees only their own accounts |

## The flow

1. User clicks **Continue with Facebook** → redirected to Meta's consent screen.
2. User approves the permissions you asked for.
3. Meta redirects back to your app with a `code`.
4. Your server swaps the `code` for a **short-lived user token**, then swaps that for a **long-lived token** (~60 days).
5. Store the long-lived token (encrypted) next to the user's record. Create a session cookie for your app.
6. Call `GET /me/adaccounts` with that token to list every ad account they can access.
7. Use the same token for `/{act_id}/campaigns`, `/insights`, etc. — your existing `/api/meta/*` routes, but with the token taken from the logged-in user instead of `process.env.FB_TOKEN`.

## One-time setup in Meta

1. Go to https://developers.facebook.com/apps → **Create App** → type **Business**.
2. Add the **Facebook Login** product.
3. Under Facebook Login → Settings, add your **Valid OAuth Redirect URI**, e.g. `https://yourdomain.com/api/auth/facebook/callback` (and `http://localhost:3055/api/auth/facebook/callback` for dev).
4. Note the **App ID** and **App Secret** → put them in `.env.local` as `FB_APP_ID` and `FB_APP_SECRET`.
5. Add a **Privacy Policy URL** and **Data Deletion URL** (required to go live).

## Permissions (read-only)

Request only:

- `ads_read` — read campaigns, ad sets, ads, and insights
- `business_management` — only if users need to see ad accounts owned through a Business Manager (often needed for agencies)

Do **not** request `ads_management` — that is the write permission. Without it your app cannot change anything.

## App Review (the part that takes time)

- **Dev mode:** only people with a role on your app (admin, developer, tester) can log in. Good for testing now.
- **Live mode for the public:** `ads_read` needs **Advanced Access**, which requires:
  1. **Business Verification** of your company (documents, can take days to weeks).
  2. **App Review**: a screen recording showing how you use `ads_read`, plus a written explanation.
  3. Privacy policy and data deletion instructions.
- Typical timeline: 1–4 weeks. Plan for at least one rejection and resubmission.

## What to build in this project

1. `GET /api/auth/facebook` → redirect to
   `https://www.facebook.com/v{VERSION}/dialog/oauth?client_id=…&redirect_uri=…&scope=ads_read&state=<random>`
2. `GET /api/auth/facebook/callback` → verify `state`, exchange `code` for a token, exchange for a long-lived token
   (`/oauth/access_token?grant_type=fb_exchange_token&client_id=…&client_secret=…&fb_exchange_token=…`), upsert the user, set a session cookie.
3. A `users` table: `id`, `fb_user_id`, `name`, `access_token` (encrypted), `token_expires_at`. You already have MySQL via `mysql2`.
4. Replace `process.env.FB_TOKEN` in the `/api/meta/*` routes with a helper like `getUserToken(req)` that reads the session and loads that user's token.
5. An account switcher populated from `/me/adaccounts` (you already have `AccountSwitcher.jsx`) instead of `AD_ACCOUNT_ID`.
6. Replace the passcode login with the Facebook login.

## Things to plan for

- **Token expiry:** long-lived tokens last ~60 days. When one expires or the user revokes access, API calls return error code 190 — send them back through login.
- **Rate limits:** Meta limits calls per app and per ad account. Cache insights (e.g. in MySQL or memory for 5–15 min) so many users don't hammer the API.
- **Security:** never expose tokens to the browser; keep them server-side only, encrypted at rest. Use the `state` parameter to prevent CSRF. Always scope DB queries to the logged-in user.
- **Data deletion:** Meta requires a callback or page where users can request deletion of their data.
- **Alternative for agencies:** a **System User** token in Business Manager works for accounts you manage yourself, but it doesn't let other people log in with their own Facebook — it isn't a replacement for OAuth here.

## Two issues in the current repo to fix before going public

- `src/app/api/login/route.js` has the passcode hardcoded, and the repo `ingsunny/meta` is **public**, so the passcode is visible to anyone. Change it, move it to an env var, or make the repo private.
- Your `.env.local` token (`FB_TOKEN`) is a personal dev token and must never be shared with end users — the OAuth flow above replaces it.
