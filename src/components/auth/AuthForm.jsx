"use client";

// Shared form for /login and /signup. Posts JSON to /api/auth/{mode}; on
// success hard-navigates so the new session cookie rides the next request.

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

function Field({ label, hint, ...props }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[13px] font-medium text-ink-800">
        {label}
        {hint && <span className="text-xs font-normal text-ink-500">{hint}</span>}
      </span>
      <input
        {...props}
        className="mt-1.5 block w-full h-11 rounded-xl bg-white px-3.5 text-[15px] text-ink-900 ring-1 ring-ink-200 shadow-[0_1px_2px_rgba(18,18,18,0.04)] placeholder:text-ink-400 outline-none transition focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}

export function AuthForm({ mode }) {
  const isSignup = mode === "signup";
  const params = useSearchParams();
  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        window.location.href = safeNext;
        return;
      }
      setError(data.error || "Something went wrong. Try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setLoading(false);
  };

  return (
    <div>
      <h1 className="font-display text-[40px] leading-tight text-ink-900">
        {isSignup ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-2 text-[15px] text-ink-600">
        {isSignup
          ? "Start with reports right away. Connect Meta whenever you're ready."
          : "Sign in to your ads, analytics and reports."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        {isSignup && (
          <Field
            label="Full name"
            autoComplete="name"
            placeholder="Alex Morgan"
            value={form.name}
            onChange={set("name")}
            required
            autoFocus
          />
        )}
        <Field
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={form.email}
          onChange={set("email")}
          required
          autoFocus={!isSignup}
        />
        <div className="relative">
          <Field
            label="Password"
            hint={isSignup ? "8+ characters" : undefined}
            type={showPw ? "text" : "password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder="••••••••"
            value={form.password}
            onChange={set("password")}
            required
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 bottom-3 text-ink-400 hover:text-ink-700"
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="group w-full h-11 rounded-xl bg-ink-900 text-white text-[15px] font-medium inline-flex items-center justify-center gap-2 shadow-[0_8px_20px_-8px_rgba(18,18,18,0.6)] transition hover:bg-ink-800 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <>
              {isSignup ? "Create account" : "Sign in"}
              <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>

      <p className="mt-8 text-sm text-ink-600">
        {isSignup ? "Already have an account? " : "New to Toosio? "}
        <Link
          href={`${isSignup ? "/login" : "/signup"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
