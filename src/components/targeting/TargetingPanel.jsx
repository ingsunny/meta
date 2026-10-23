"use client";

import {
  MapPin,
  Users,
  Smartphone,
  Heart,
  UserSquare2,
  Sparkles,
  Ban,
} from "lucide-react";

// Meta's gender enum: 1 = male, 2 = female.
function genderLabel(genders) {
  if (!genders?.length) return "All genders";
  const set = new Set(genders);
  if (set.has(1) && set.has(2)) return "All genders";
  if (set.has(1)) return "Male";
  if (set.has(2)) return "Female";
  return "—";
}

function ageLabel(t) {
  const min = t.age_min ?? 18;
  const max = t.age_max ?? 65;
  return `${min}–${max}`;
}

function locationLabel(geo) {
  if (!geo) return null;
  const parts = [];
  if (geo.countries?.length) parts.push(geo.countries.join(", "));
  if (geo.country_groups?.length) parts.push(geo.country_groups.join(", "));
  if (geo.regions?.length)
    parts.push(`${geo.regions.length} region${geo.regions.length > 1 ? "s" : ""}`);
  if (geo.cities?.length) {
    const names = geo.cities.slice(0, 3).map((c) => c.name).filter(Boolean);
    const more = geo.cities.length > 3 ? ` +${geo.cities.length - 3} more` : "";
    parts.push(`${names.join(", ")}${more}`);
  }
  if (geo.zips?.length) parts.push(`${geo.zips.length} zip codes`);
  return parts.length ? parts.join(" · ") : null;
}

function placementLabel(t) {
  const platforms = t.publisher_platforms;
  if (!platforms?.length) return "Advantage+ placements (automatic)";
  const fmt = {
    facebook: "Facebook",
    instagram: "Instagram",
    audience_network: "Audience Network",
    messenger: "Messenger",
  };
  const parts = platforms.map((p) => fmt[p] || p);
  const positions = [];
  if (t.facebook_positions?.length)
    positions.push(`FB: ${t.facebook_positions.join(", ")}`);
  if (t.instagram_positions?.length)
    positions.push(`IG: ${t.instagram_positions.join(", ")}`);
  return positions.length
    ? `${parts.join(", ")} (${positions.join(" · ")})`
    : parts.join(", ");
}

function deviceLabel(t) {
  const dev = t.device_platforms;
  if (!dev?.length) return "All devices";
  return dev.map((d) => (d === "mobile" ? "Mobile" : "Desktop")).join(", ");
}

// Pull interests / behaviors / custom audiences from both top-level
// `interests`/`behaviors`/`custom_audiences` AND `flexible_spec[]` (Meta's
// newer "narrow audience" structure can store them there).
function collectInclusions(t) {
  const interests = new Map();
  const behaviors = new Map();
  const customs = new Map();

  const addEach = (items, map) => {
    (items || []).forEach((it) => map.set(it.id || it.name, it.name || it.id));
  };

  addEach(t.interests, interests);
  addEach(t.behaviors, behaviors);
  addEach(t.custom_audiences, customs);

  (t.flexible_spec || []).forEach((spec) => {
    addEach(spec.interests, interests);
    addEach(spec.behaviors, behaviors);
  });

  return {
    interests: Array.from(interests.values()),
    behaviors: Array.from(behaviors.values()),
    customs: Array.from(customs.values()),
  };
}

function collectExclusions(t) {
  const exc = t.exclusions || {};
  return {
    interests: (exc.interests || []).map((x) => x.name).filter(Boolean),
    behaviors: (exc.behaviors || []).map((x) => x.name).filter(Boolean),
    customs: (t.excluded_custom_audiences || [])
      .map((x) => x.name)
      .filter(Boolean),
  };
}

function ChipList({ items, max = 12, tone = "default" }) {
  if (!items?.length) return <span className="text-ink-400 text-xs">—</span>;
  const visible = items.slice(0, max);
  const more = items.length - visible.length;
  const colors = {
    default: "bg-ink-100 text-ink-700",
    exclude: "bg-rose-50 text-rose-700",
    audience: "bg-brand-50 text-brand-700",
  }[tone];
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((label, i) => (
        <span
          key={`${label}-${i}`}
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${colors}`}
        >
          {label}
        </span>
      ))}
      {more > 0 && (
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-ink-100 text-ink-500">
          +{more} more
        </span>
      )}
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-ink-100 last:border-b-0">
      <div className="h-8 w-8 shrink-0 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
        <Icon size={14} strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
          {label}
        </p>
        <div className="mt-1 text-sm text-ink-800">{value}</div>
      </div>
    </div>
  );
}

export function TargetingPanel({ targeting, compact = false }) {
  if (!targeting || Object.keys(targeting).length === 0) {
    return (
      <div className="surface px-4 py-6 text-center">
        <p className="text-sm text-ink-500">
          No targeting data is available for this item.
        </p>
        <p className="text-[11px] text-ink-400 mt-1">
          Targeting is set at the ad-set level. Campaigns aggregate from their
          ad sets and don't expose a single targeting object.
        </p>
      </div>
    );
  }

  const t = targeting;
  const incl = collectInclusions(t);
  const excl = collectExclusions(t);
  const advantage = t.targeting_automation?.advantage_audience === 1;

  return (
    <div className={compact ? "" : "grid gap-4 lg:grid-cols-2"}>
      <div className="surface overflow-hidden">
        <Row
          icon={MapPin}
          label="Location"
          value={
            <p className="text-sm font-semibold text-ink-800">
              {locationLabel(t.geo_locations) || "Worldwide"}
            </p>
          }
        />
        <Row
          icon={UserSquare2}
          label="Demographics"
          value={
            <p className="text-sm font-semibold text-ink-800 tabular">
              Age {ageLabel(t)} · {genderLabel(t.genders)}
            </p>
          }
        />
        <Row
          icon={Smartphone}
          label="Placements & devices"
          value={
            <div className="space-y-1">
              <p className="text-sm text-ink-800">{placementLabel(t)}</p>
              <p className="text-xs text-ink-500">{deviceLabel(t)}</p>
            </div>
          }
        />
        {advantage && (
          <Row
            icon={Sparkles}
            label="Advantage+ audience"
            value={
              <p className="text-sm text-emerald-700 font-semibold">
                On — Meta is expanding beyond the defined audience.
              </p>
            }
          />
        )}
      </div>

      <div className="surface overflow-hidden">
        <Row
          icon={Heart}
          label={`Interests (${incl.interests.length})`}
          value={<ChipList items={incl.interests} />}
        />
        {incl.behaviors.length > 0 && (
          <Row
            icon={Users}
            label={`Behaviors (${incl.behaviors.length})`}
            value={<ChipList items={incl.behaviors} />}
          />
        )}
        {incl.customs.length > 0 && (
          <Row
            icon={Users}
            label={`Custom audiences (${incl.customs.length})`}
            value={<ChipList items={incl.customs} tone="audience" />}
          />
        )}
        {(excl.interests.length > 0 ||
          excl.behaviors.length > 0 ||
          excl.customs.length > 0) && (
          <Row
            icon={Ban}
            label="Exclusions"
            value={
              <div className="space-y-1.5">
                {excl.interests.length > 0 && (
                  <ChipList items={excl.interests} tone="exclude" />
                )}
                {excl.behaviors.length > 0 && (
                  <ChipList items={excl.behaviors} tone="exclude" />
                )}
                {excl.customs.length > 0 && (
                  <ChipList items={excl.customs} tone="exclude" />
                )}
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}

// Returns a one-line summary string for use in compare tables / row hints.
export function targetingSummary(t) {
  if (!t) return "—";
  const incl = collectInclusions(t);
  const parts = [
    `${ageLabel(t)} ${genderLabel(t.genders)}`,
    locationLabel(t.geo_locations) || "Worldwide",
    incl.interests.length > 0
      ? `${incl.interests.length} interest${incl.interests.length > 1 ? "s" : ""}`
      : null,
    incl.customs.length > 0
      ? `${incl.customs.length} custom audience${incl.customs.length > 1 ? "s" : ""}`
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
