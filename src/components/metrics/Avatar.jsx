import { isDelivering } from "@/lib/meta/status";

const PALETTE = [
  ["bg-blue-100", "text-blue-700"],
  ["bg-violet-100", "text-violet-700"],
  ["bg-emerald-100", "text-emerald-700"],
  ["bg-amber-100", "text-amber-800"],
  ["bg-rose-100", "text-rose-700"],
  ["bg-cyan-100", "text-cyan-700"],
  ["bg-pink-100", "text-pink-700"],
  ["bg-indigo-100", "text-indigo-700"],
];

function hash(s = "") {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name = "") {
  const clean = name.replace(/[^A-Za-z0-9 \-]/g, " ").trim();
  if (!clean) return "·";
  const parts = clean.split(/[\s\-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({ name, node, size = "md", showStatusDot = true }) {
  const idx = hash(name) % PALETTE.length;
  const [bg, text] = PALETTE[idx];
  const sizes = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-xs",
    lg: "h-12 w-12 text-sm",
  }[size];
  const live = node && isDelivering(node);
  return (
    <div className="relative shrink-0">
      <div
        className={`${sizes} ${bg} ${text} rounded-full flex items-center justify-center font-semibold tracking-tight ring-2 ring-white`}
      >
        {initials(name)}
      </div>
      {showStatusDot && node && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
            live ? "bg-emerald-500" : "bg-ink-300"
          }`}
        />
      )}
    </div>
  );
}
