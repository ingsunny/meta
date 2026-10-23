"use client";

// Product sidebar. Tools up top, connections + settings below, the user
// card pinned to the bottom. Collapses into a drawer under `lg`.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Megaphone,
  LineChart,
  FileSpreadsheet,
  Plug,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";

const NAV = [
  {
    label: null,
    items: [{ href: "/home", label: "Home", icon: Home }],
  },
  {
    label: "Tools",
    items: [
      { href: "/meta", label: "Ads Manager", icon: Megaphone, badge: "meta" },
      { href: "/analytics", label: "Analytics", icon: LineChart },
      { href: "/reports", label: "Reports", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function initials(name) {
  return (
    String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("") || "?"
  );
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/login";
}

function NavContent({ user, metaConnected, pathname, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 h-16 flex items-center">
        <Link href="/home" onClick={onNavigate}>
          <Logo size={26} />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-2 space-y-6">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-400">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, badge }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      className={`group flex items-center gap-3 rounded-lg px-3 h-9 text-[14px] transition-colors ${
                        active
                          ? "bg-white text-ink-900 font-medium shadow-card"
                          : "text-ink-600 hover:text-ink-900 hover:bg-ink-200/50"
                      }`}
                    >
                      <Icon
                        size={17}
                        strokeWidth={active ? 2.2 : 1.8}
                        className={active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600"}
                      />
                      <span className="flex-1">{label}</span>
                      {badge === "meta" && (
                        <span
                          title={metaConnected ? "Meta connected" : "Meta not connected"}
                          className={`h-1.5 w-1.5 rounded-full ${metaConnected ? "bg-good" : "bg-ink-300"}`}
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-ink-200/70">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="h-8 w-8 shrink-0 rounded-full bg-ink-900 text-white text-xs font-semibold flex items-center justify-center">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[13px] font-medium text-ink-900 truncate">{user.name}</p>
            <p className="text-xs text-ink-500 truncate">{user.email}</p>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-800 hover:bg-ink-200/60"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ user, metaConnected }) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-60 bg-ink-100 border-r border-ink-200/70 z-40">
        <NavContent user={user} metaConnected={metaConnected} pathname={pathname} />
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-ink-100/90 backdrop-blur border-b border-ink-200/70">
        <Link href="/home">
          <Logo size={24} />
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="h-9 w-9 rounded-lg flex items-center justify-center text-ink-700 hover:bg-ink-200/60"
        >
          <Menu size={20} />
        </button>
      </div>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-100 shadow-pop animate-in slide-in-from-left duration-200">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 h-8 w-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-200/60"
            >
              <X size={18} />
            </button>
            <NavContent
              user={user}
              metaConnected={metaConnected}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}
