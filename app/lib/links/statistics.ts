import { isWithinSchedule, type SiteLinkKind } from "./definitions";

/*
 * The statistics of `/links`: where a visit came from, which Bolivian day it
 * fell on, and the sums the dashboard shows. Plain functions, for the page in
 * the browser, the endpoints and the dashboard alike.
 */

/** Where a visit came from, read from the referrer. A fixed, small set. */
export const LINKS_SOURCES = [
  "instagram",
  "tiktok",
  "facebook",
  "direct",
  "other",
] as const;
export type LinksSource = (typeof LINKS_SOURCES)[number];

export const LINKS_SOURCE_LABELS: Record<LinksSource, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  direct: "Directo",
  other: "Otros sitios",
};

/** A source a caller sent, or `other` for anything not in the set. */
export function toLinksSource(value: unknown): LinksSource {
  return typeof value === "string" &&
    (LINKS_SOURCES as readonly string[]).includes(value)
    ? (value as LinksSource)
    : "other";
}

/** The hosts of each network, `www.`, `m.`, `l.` and `lm.` aside. */
const SOURCE_HOSTS: [LinksSource, readonly string[]][] = [
  ["instagram", ["instagram.com"]],
  ["tiktok", ["tiktok.com"]],
  ["facebook", ["facebook.com", "fb.com", "fb.me", "messenger.com"]],
];

/** The Android apps that send `android-app://<package>/` as the referrer. */
const SOURCE_APPS: Record<string, LinksSource> = {
  "com.instagram.android": "instagram",
  "com.zhiliaoapp.musically": "tiktok",
  "com.ss.android.ugc.trill": "tiktok",
  "com.facebook.katana": "facebook",
  "com.facebook.lite": "facebook",
  "com.facebook.orca": "facebook",
};

/**
 * Where a visit came from, by its `document.referrer`. No referrer (typed,
 * a bookmark, an app that sends none) is `direct`, and so is a page of this
 * same site (`ownHost`): neither is another site sending visitors. Instagram's
 * in-app browser reports `l.instagram.com`.
 */
export function classifyReferrer(
  referrer: string | null | undefined,
  ownHost?: string | null,
): LinksSource {
  const value = referrer?.trim() ?? "";
  if (!value) return "direct";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "other";
  }
  if (url.protocol === "android-app:") {
    return SOURCE_APPS[url.hostname.toLowerCase()] ?? "other";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "other";
  const host = url.hostname.toLowerCase();
  if (ownHost && host === ownHost.toLowerCase()) return "direct";
  for (const [source, hosts] of SOURCE_HOSTS) {
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return source;
  }
  return "other";
}

/*
 * Days. A day is a day in Bolivia, which is UTC-4 all year (no summer time,
 * see `LINKS_TIME_ZONE` in definitions.ts), written `YYYY-MM-DD` as Postgres reads a `date`.
 */

const LINKS_UTC_OFFSET_MS = -4 * 60 * 60 * 1000;

/** The Bolivian day `date` falls on. */
export function linksDay(date: Date): string {
  return new Date(date.getTime() + LINKS_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** `day` moved by `days` (negative goes back). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

const dayLabelFormat = new Intl.DateTimeFormat("es-BO", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const dayLabelWithYearFormat = new Intl.DateTimeFormat("es-BO", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "17 nov", for a day of the chart and the period. */
export function formatLinksDay(day: string, withYear = false): string {
  return (withYear ? dayLabelWithYearFormat : dayLabelFormat).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** The periods the dashboard offers, in days, the last one included. */
export const STATS_PERIODS = [7, 28, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];
export const DEFAULT_STATS_PERIOD: StatsPeriod = 28;

export const STATS_PERIOD_LABELS: Record<StatsPeriod, string> = {
  7: "Últimos 7 días",
  28: "Últimos 28 días",
  90: "Últimos 90 días",
};

/** A period from the address, or the default for anything else. */
export function toStatsPeriod(value: unknown): StatsPeriod {
  const number = Number(Array.isArray(value) ? value[0] : value);
  return (STATS_PERIODS as readonly number[]).includes(number)
    ? (number as StatsPeriod)
    : DEFAULT_STATS_PERIOD;
}

export type PeriodRange = {
  /** The period: the last `days` days, today included. */
  from: string;
  to: string;
  /** The same number of days just before it. */
  previousFrom: string;
  previousTo: string;
};

export function periodRange(today: string, days: number): PeriodRange {
  const from = addDays(today, -(days - 1));
  return {
    from,
    to: today,
    previousFrom: addDays(from, -days),
    previousTo: addDays(from, -1),
  };
}

/**
 * Taps per view, as a fraction (0.25 is 25 %). Null with no views: there is
 * no rate to give, and 0 % would say visitors came and tapped nothing. Can
 * pass 1, since one visit can tap several links.
 */
export function clickThroughRate(taps: number, views: number): number | null {
  return views > 0 ? taps / views : null;
}

/**
 * How much `current` changed from `previous`, as a fraction (0.5 is +50 %).
 * Null when there was nothing before: growth from zero has no percentage.
 */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

/*
 * The dashboard's numbers, from the rows the database gives back.
 */

export type DailyViewRow = { day: string; source: string; views: number };
export type DailyClickRow = {
  linkId: number | null;
  day: string;
  source: string;
  clicks: number;
};
export type StatsLink = {
  id: number;
  kind: string;
  label: string;
  isVisible: boolean;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  clickCount: number;
};

export type StatsTotals = {
  views: number;
  taps: number;
  ctr: number | null;
};

export type LinkStatsRow = {
  /** Null for the row of deleted links. */
  id: number | null;
  kind: SiteLinkKind | null;
  label: string;
  /** Not on the page now: switched off or outside its schedule. */
  hidden: boolean;
  taps: number;
  /** Of all taps in the period; null when there were none. */
  share: number | null;
  /** `click_count`, since before the statistics began; null once deleted. */
  lifetime: number | null;
};

export type LinksStatistics = {
  period: StatsPeriod;
  range: PeriodRange;
  /** The first day anything was counted, or null when nothing has been. */
  firstDay: string | null;
  totals: StatsTotals;
  /**
   * The previous period, only when it was counted whole: one that falls
   * before the statistics began would read as a rise from nothing.
   */
  previous: StatsTotals | null;
  change: {
    views: number | null;
    taps: number | null;
    /** In percentage points, as a fraction (0.012 is +1.2 points). */
    ctr: number | null;
  };
  daily: { day: string; views: number; taps: number }[];
  sources: ({ source: LinksSource } & StatsTotals)[];
  links: LinkStatsRow[];
};

function sumWithin<T extends { day: string }>(
  rows: T[],
  from: string,
  to: string,
  value: (row: T) => number,
) {
  return rows.reduce(
    (sum, row) => (row.day >= from && row.day <= to ? sum + value(row) : sum),
    0,
  );
}

export function buildLinksStatistics(input: {
  period: StatsPeriod;
  now: Date;
  firstDay: string | null;
  /** Rows of the period and the one before it. */
  views: DailyViewRow[];
  clicks: DailyClickRow[];
  /** Every link and social icon there is now. */
  links: StatsLink[];
}): LinksStatistics {
  const { period, now, firstDay, links } = input;
  const range = periodRange(linksDay(now), period);
  const views = input.views.map((row) => ({
    ...row,
    source: toLinksSource(row.source),
  }));
  const clicks = input.clicks.map((row) => ({
    ...row,
    source: toLinksSource(row.source),
  }));

  const totalsWithin = (from: string, to: string): StatsTotals => {
    const v = sumWithin(views, from, to, (row) => row.views);
    const t = sumWithin(clicks, from, to, (row) => row.clicks);
    return { views: v, taps: t, ctr: clickThroughRate(t, v) };
  };

  const totals = totalsWithin(range.from, range.to);
  const previous =
    firstDay != null && firstDay <= range.previousFrom
      ? totalsWithin(range.previousFrom, range.previousTo)
      : null;
  const change = {
    views: previous ? percentChange(totals.views, previous.views) : null,
    taps: previous ? percentChange(totals.taps, previous.taps) : null,
    ctr:
      previous && totals.ctr != null && previous.ctr != null
        ? totals.ctr - previous.ctr
        : null,
  };

  const daily = daysBetween(range.from, range.to).map((day) => ({
    day,
    views: sumWithin(views, day, day, (row) => row.views),
    taps: sumWithin(clicks, day, day, (row) => row.clicks),
  }));

  const sources = LINKS_SOURCES.map((source) => {
    const v = sumWithin(
      views.filter((row) => row.source === source),
      range.from,
      range.to,
      (row) => row.views,
    );
    const t = sumWithin(
      clicks.filter((row) => row.source === source),
      range.from,
      range.to,
      (row) => row.clicks,
    );
    return { source, views: v, taps: t, ctr: clickThroughRate(t, v) };
  });

  const tapsByLink = new Map<number | null, number>();
  for (const row of clicks) {
    if (row.day < range.from || row.day > range.to) continue;
    tapsByLink.set(row.linkId, (tapsByLink.get(row.linkId) ?? 0) + row.clicks);
  }
  const share = (taps: number) => (totals.taps > 0 ? taps / totals.taps : null);

  const rows: LinkStatsRow[] = [];
  for (const link of links) {
    const taps = tapsByLink.get(link.id) ?? 0;
    const hidden = !link.isVisible || !isWithinSchedule(link, now);
    // A hidden link is listed only when it was tapped in the period.
    if (hidden && taps === 0) continue;
    rows.push({
      id: link.id,
      kind: link.kind === "social" ? "social" : "link",
      label: link.label,
      hidden,
      taps,
      share: share(taps),
      lifetime: link.clickCount,
    });
  }
  const deletedTaps = tapsByLink.get(null) ?? 0;
  if (deletedTaps > 0) {
    rows.push({
      id: null,
      kind: null,
      label: "Enlaces eliminados",
      hidden: true,
      taps: deletedTaps,
      share: share(deletedTaps),
      lifetime: null,
    });
  }
  // Most taps first; ties keep the page's own order (links before socials
  // come in already sorted), the deleted links last.
  const order = new Map(rows.map((row, index) => [row, index]));
  rows.sort((a, b) => b.taps - a.taps || order.get(a)! - order.get(b)!);

  return {
    period,
    range,
    firstDay,
    totals,
    previous,
    change,
    daily,
    sources,
    links: rows,
  };
}
