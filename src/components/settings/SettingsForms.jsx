"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";

function Section({ title, sub, children }) {
  return (
    <section className="surface grid md:grid-cols-[260px_1fr] gap-6 p-6">
      <div>
        <h2 className="text-[15px] font-medium text-ink-900">{title}</h2>
        {sub && <p className="mt-1 text-[13px] text-ink-500">{sub}</p>}
      </div>
      <div className="max-w-md">{children}</div>
    </section>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className="block w-full h-10 rounded-lg bg-white px-3 text-sm text-ink-900 ring-1 ring-ink-200 outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50 disabled:text-ink-500"
    />
  );
}

function useSubmit() {
  const [state, setState] = useState({ busy: false, msg: null, ok: false });
  const run = async (body) => {
    setState({ busy: true, msg: null, ok: false });
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && data.success;
    setState({ busy: false, ok, msg: ok ? "Saved." : data.error || "Something went wrong." });
    return ok;
  };
  return [state, run];
}

export function SettingsForms({ user }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [profile, saveProfile] = useSubmit();
  const [password, savePassword] = useSubmit();

  const Msg = ({ s }) =>
    s.msg ? <p className={`mt-3 text-[13px] ${s.ok ? "text-good" : "text-bad"}`}>{s.msg}</p> : null;

  return (
    <div className="space-y-4">
      <Section title="Profile" sub="How you appear across Toosio.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await saveProfile({ name })) router.refresh();
          }}
          className="space-y-3"
        >
          <label className="block text-[13px] font-medium text-ink-800">
            Name
            <div className="mt-1.5">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </label>
          <label className="block text-[13px] font-medium text-ink-800">
            Email
            <div className="mt-1.5">
              <Input value={user.email} disabled />
            </div>
          </label>
          <button
            disabled={profile.busy}
            className="h-9 px-4 rounded-lg bg-ink-900 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {profile.busy && <Loader2 size={14} className="animate-spin" />} Save
          </button>
          <Msg s={profile} />
        </form>
      </Section>

      <Section title="Password" sub="At least 8 characters.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await savePassword(pw)) setPw({ currentPassword: "", newPassword: "" });
          }}
          className="space-y-3"
        >
          <Input
            type="password"
            placeholder="Current password"
            autoComplete="current-password"
            value={pw.currentPassword}
            onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
          />
          <Input
            type="password"
            placeholder="New password"
            autoComplete="new-password"
            value={pw.newPassword}
            onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
          />
          <button
            disabled={password.busy || !pw.currentPassword || !pw.newPassword}
            className="h-9 px-4 rounded-lg bg-ink-900 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {password.busy && <Loader2 size={14} className="animate-spin" />} Update password
          </button>
          <Msg s={password} />
        </form>
      </Section>

      <Section title="Session" sub={`Member since ${new Date(`${user.createdAt}Z`.replace(" ", "T")).toLocaleDateString("en-US", { month: "long", year: "numeric" })}.`}>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="h-9 px-4 rounded-lg bg-white text-sm font-medium text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50 inline-flex items-center gap-2"
        >
          <LogOut size={14} /> Sign out
        </button>
      </Section>
    </div>
  );
}
