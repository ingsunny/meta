// Toosio mark: two offset bars forming a rising "chart" inside a rounded
// square. Pure SVG so it stays crisp at any size. The gradient id is
// per-instance: with a shared id, a hidden copy (the desktop sidebar on
// mobile) breaks the visible one.

import { useId } from "react";

export function LogoMark({ size = 28, className = "" }) {
  const gid = `toosio-g-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7f86f8" />
          <stop offset="1" stopColor="#3b3ab3" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
      <rect x="8" y="15" width="5" height="9" rx="2.5" fill="#fff" fillOpacity="0.6" />
      <rect x="15.5" y="8" width="5" height="16" rx="2.5" fill="#fff" />
      <circle cx="24" cy="10" r="2.2" fill="#fff" fillOpacity="0.85" />
    </svg>
  );
}

export function Logo({ size = 28, tone = "dark" }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span
        className={`text-[17px] font-semibold tracking-tight ${
          tone === "light" ? "text-white" : "text-ink-900"
        }`}
      >
        toosio
      </span>
    </span>
  );
}
