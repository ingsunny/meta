"use client";

// Passcode gate. Submits to /api/login; on success the server sets the auth
// cookie and we hard-navigate to the original destination so the new cookie
// ships with every subsequent request.

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // Hard navigation so the freshly-set cookie ships with the next
        // request and middleware sees it.
        window.location.href = next;
        return;
      }

      setError("Wrong passcode. Try again.");
      setLoading(false);
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white ring-1 ring-ink-200/70 shadow-sm px-7 py-7">
        <div className="text-center mb-6">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white mb-4">
            <Lock size={20} />
          </span>
          <h1 className="text-lg font-bold text-ink-900 leading-tight">
            Enter passcode
          </h1>
          <p className="text-[12.5px] text-ink-500 mt-1.5 leading-relaxed">
            Required to access the dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            autoFocus
            placeholder="Passcode"
            autoComplete="current-password"
            className={`w-full px-4 py-2.5 text-sm rounded-lg ring-1 bg-white text-ink-900 placeholder:text-ink-400 outline-none transition-shadow focus:ring-2 focus:ring-brand-400 ${
              error ? "ring-rose-300" : "ring-ink-200/70"
            }`}
          />

          {error && (
            <p className="text-[12px] font-semibold text-rose-700 px-1 leading-tight">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 text-white text-sm font-semibold px-4 py-2.5 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
