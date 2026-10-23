"use client";

// Meta connection card: connect via Facebook Login (when the app is
// configured) or by pasting an access token; once connected, lists the
// discovered ad accounts with re-sync / disconnect.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Unplug, KeyRound, ChevronDown } from "lucide-react";

const STATUS = {
  1: ["Active", "bg-good-soft text-good"],
  2: ["Disabled", "bg-bad-soft text-bad"],
  3: ["Unsettled", "bg-warn-soft text-warn"],
  7: ["Pending review", "bg-warn-soft text-warn"],
  9: ["Grace period", "bg-warn-soft text-warn"],
  101: ["Closed", "bg-ink-200 text-ink-600"],
};

function MetaMark() {
  return (
    <span className="h-11 w-11 rounded-xl bg-[#e8f0fe] flex items-center justify-center">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="#0866ff"
          d="M6.9 5C4.2 5 2 8.6 2 12.6 2 15.3 3.4 17 5.4 17c1.7 0 2.9-1.1 4.7-4.1l1-1.6.6 1c1.9 3.1 3.1 4.7 5.3 4.7 2.4 0 4-2.2 4-5.4C21 8.4 18.8 5 16 5c-1.8 0-3.2 1.3-4.5 3.2C10.3 6.2 8.8 5 6.9 5Zm-.1 2.3c1.1 0 2 .9 3.4 3l-1 1.7c-1.5 2.4-2.2 3-3 3-.9 0-1.6-.9-1.6-2.6 0-2.7 1-5.1 2.2-5.1Zm9.2 0c1.4 0 2.5 2.2 2.5 4.9 0 1.6-.6 2.5-1.5 2.5-1 0-1.6-.7-3.4-3.6l-.8-1.3c1.2-1.8 2.1-2.5 3.2-2.5Z"
        />
      </svg>
    </span>
  );
}

export function MetaIntegrationCard({ integration, oauthReady }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(!oauthReady);

  const call = async (key, url, opts) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || "Request failed");
      setToken("");
      router.refresh();
    } catch (e) {
      setError(e.message);
    }
    setBusy(null);
  };

  const connected = Boolean(integration);
  const active = integration?.status === "active";

  return (
    <div className="surface overflow-hidden">
      <div className="p-6 flex flex-wrap items-start gap-4">
        <MetaMark />
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2">
            <p className="text-[17px] font-semibold text-ink-900">Meta</p>
            {connected && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  active ? "bg-good-soft text-good" : "bg-warn-soft text-warn"
                }`}
              >
                {active ? "Connected" : "Needs reconnect"}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-600">
            {connected
              ? `Signed in as ${integration.external_name} · ${integration.accounts.length} ad account${
                  integration.accounts.length === 1 ? "" : "s"
                } · via ${integration.method === "oauth" ? "Facebook Login" : "access token"}`
              : "Facebook and Instagram ads. Read-only access (ads_read) to every ad account your login can see."}
          </p>
          {!oauthReady && (
            <p className="mt-2 text-xs text-ink-500">
              One-click “Continue with Facebook” turns on once FB_APP_ID and FB_APP_SECRET are set on the server.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {connected && (
            <>
              <button
                onClick={() => call("sync", "/api/integrations/meta/sync", { method: "POST" })}
                disabled={!!busy}
                className="h-9 px-3 rounded-lg text-sm font-medium text-ink-700 ring-1 ring-ink-200 bg-white hover:bg-ink-50 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy === "sync" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Re-sync
              </button>
              <button
                onClick={() => {
                  if (confirm("Disconnect Meta? Your stored token is deleted.")) {
                    call("disconnect", "/api/integrations/meta", { method: "DELETE" });
                  }
                }}
                disabled={!!busy}
                className="h-9 px-3 rounded-lg text-sm font-medium text-bad ring-1 ring-ink-200 bg-white hover:bg-bad-soft inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Unplug size={14} />
                Disconnect
              </button>
            </>
          )}
          {oauthReady && (!connected || !active) && (
            <a
              href="/api/integrations/meta/connect"
              className="h-9 px-4 rounded-lg bg-[#0866ff] text-white text-sm font-medium inline-flex items-center hover:bg-[#0757d6]"
            >
              Continue with Facebook
            </a>
          )}
        </div>
      </div>

      {error && <p className="mx-6 mb-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

      {connected && integration.accounts.length > 0 && (
        <ul className="border-t border-ink-200/70 divide-y divide-ink-200/60">
          {integration.accounts.map((a) => {
            const [label, cls] = STATUS[a.account_status] || ["Unknown", "bg-ink-200 text-ink-600"];
            return (
              <li key={a.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                <span className="h-8 w-8 rounded-lg bg-ink-100 text-ink-600 flex items-center justify-center text-xs font-semibold">
                  {(a.name || "?").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900 truncate">{a.name}</p>
                  <p className="text-xs text-ink-500 font-mono">
                    {a.id} · {a.currency}
                    {a.business_name ? ` · ${a.business_name}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      )}

      {(!connected || !active || !oauthReady) && (
        <div className="border-t border-ink-200/70 bg-ink-50/70">
          <button
            onClick={() => setShowToken((v) => !v)}
            className="w-full px-6 py-3 flex items-center gap-2 text-sm text-ink-700 hover:text-ink-900"
          >
            <KeyRound size={15} className="text-ink-400" />
            {connected ? "Replace the access token" : "Connect with an access token instead"}
            <ChevronDown size={15} className={`ml-auto transition ${showToken ? "rotate-180" : ""}`} />
          </button>
          {showToken && (
            <form
              className="px-6 pb-6"
              onSubmit={(e) => {
                e.preventDefault();
                call("token", "/api/integrations/meta/token", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token }),
                });
              }}
            >
              <p className="text-[13px] text-ink-600 mb-3 max-w-2xl">
                Generate a user token with the <code className="font-mono text-ink-800">ads_read</code> permission in{" "}
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 hover:underline"
                >
                  Graph API Explorer
                </a>{" "}
                or a System User token in Business Settings. It&apos;s encrypted before it&apos;s stored.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="EAAB…"
                  autoComplete="off"
                  className="flex-1 h-10 rounded-lg bg-white px-3 font-mono text-sm ring-1 ring-ink-200 outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="submit"
                  disabled={!!busy || !token.trim()}
                  className="h-10 px-4 rounded-lg bg-ink-900 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {busy === "token" && <Loader2 size={14} className="animate-spin" />}
                  Connect
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
