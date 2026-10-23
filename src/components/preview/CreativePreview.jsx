"use client";

import { useEffect, useState } from "react";
import { Smartphone, Monitor, Film, BookOpen, RectangleHorizontal } from "lucide-react";

// Curated set of placements that cover the common cases. Each tab maps to
// a Meta `ad_format` and a recommended aspect ratio for the iframe container.
const FORMATS = [
  {
    key: "MOBILE_FEED_STANDARD",
    label: "FB Feed",
    icon: Smartphone,
    ratio: "9 / 16",
    width: 320,
  },
  {
    key: "INSTAGRAM_STANDARD",
    label: "IG Feed",
    icon: Smartphone,
    ratio: "9 / 16",
    width: 320,
  },
  {
    key: "INSTAGRAM_STORY",
    label: "IG Story",
    icon: BookOpen,
    ratio: "9 / 16",
    width: 320,
  },
  {
    key: "INSTAGRAM_REELS",
    label: "IG Reels",
    icon: Film,
    ratio: "9 / 16",
    width: 320,
  },
  {
    key: "FACEBOOK_STORY_MOBILE",
    label: "FB Story",
    icon: BookOpen,
    ratio: "9 / 16",
    width: 320,
  },
  {
    key: "DESKTOP_FEED_STANDARD",
    label: "Desktop Feed",
    icon: Monitor,
    ratio: "4 / 5",
    width: 480,
  },
  {
    key: "RIGHT_COLUMN_STANDARD",
    label: "Right Column",
    icon: RectangleHorizontal,
    ratio: "1 / 1",
    width: 280,
  },
];

export function CreativePreview({ adId, creative }) {
  const [active, setActive] = useState(FORMATS[0].key);
  const [bodies, setBodies] = useState({}); // { [format]: string | null | "error" }
  const [loadingKey, setLoadingKey] = useState(null);

  useEffect(() => {
    setBodies({});
  }, [adId]);

  useEffect(() => {
    if (!adId || bodies[active] !== undefined) return;
    let alive = true;
    setLoadingKey(active);
    fetch(`/api/meta/preview?ad=${adId}&format=${active}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.success && j.body) {
          setBodies((b) => ({ ...b, [active]: j.body }));
        } else {
          setBodies((b) => ({ ...b, [active]: "error" }));
        }
      })
      .catch(() => alive && setBodies((b) => ({ ...b, [active]: "error" })))
      .finally(() => alive && setLoadingKey(null));
    return () => {
      alive = false;
    };
  }, [adId, active, bodies]);

  const current = FORMATS.find((f) => f.key === active) || FORMATS[0];
  const body = bodies[active];
  const isLoading = loadingKey === active;

  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-ink-200 overflow-x-auto">
        {FORMATS.map((f) => {
          const Icon = f.icon;
          const isActive = f.key === active;
          return (
            <button
              key={f.key}
              onClick={() => setActive(f.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-brand-500 text-white"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              <Icon size={12} />
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex justify-center bg-ink-50/60 p-6">
        <div
          className="rounded-2xl bg-white shadow-card overflow-hidden"
          style={{
            width: current.width,
            aspectRatio: current.ratio,
          }}
        >
          {isLoading && (
            <div className="h-full w-full flex flex-col items-center justify-center text-ink-400">
              <div className="h-5 w-5 rounded-full border-2 border-ink-200 border-t-brand-500 animate-spin" />
              <p className="mt-3 text-[11px] uppercase tracking-wider font-semibold">
                Rendering preview
              </p>
            </div>
          )}
          {!isLoading && body === "error" && (
            <div className="h-full w-full flex flex-col items-center justify-center text-center px-6 text-ink-500">
              <p className="text-sm font-semibold text-ink-700">
                Preview unavailable
              </p>
              <p className="mt-1 text-[11px] leading-relaxed">
                This placement may not apply to this creative format, or the ad
                isn't approved for {current.label}.
              </p>
            </div>
          )}
          {!isLoading && body && body !== "error" && (
            <iframe
              key={`${adId}-${active}`}
              title={`Preview · ${current.label}`}
              srcDoc={body}
              sandbox="allow-scripts allow-same-origin allow-popups"
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>

      {creative?.thumbnail_url && (
        <div className="px-4 py-3 border-t border-ink-200 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={creative.thumbnail_url}
            alt=""
            className="h-10 w-10 rounded-md object-cover bg-ink-100 ring-1 ring-ink-200"
          />
          <div className="min-w-0 text-xs">
            <p className="font-semibold text-ink-800 truncate">
              {creative.name || "Creative"}
            </p>
            <p className="text-ink-500 font-mono text-[10px] mt-0.5">
              {creative.id} {creative.object_type ? `· ${creative.object_type}` : ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
