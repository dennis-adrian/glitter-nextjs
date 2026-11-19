// @vitest-environment node

import { and, eq, gte, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  LINKS_SUITE_LOCK,
  disposableDatabaseProblem,
} from "@/app/lib/links/disposable-test-database";
import { linksDay, type LinksSource } from "@/app/lib/links/statistics";
import * as schema from "@/db/schema";
import {
  siteLinks,
  siteLinksDailyClicks,
  siteLinksDailyViews,
} from "@/db/schema";

/**
 * The statistics of `/links` against a real database: the view and tap
 * endpoints, the day and source they land on, increments that run at once,
 * the rules for what counts, the rate limit, and who may read the numbers.
 *
 * The suite only touches rows of its own: links it adds (removed at the end,
 * with their daily rows), views on days no one else writes (in 2099), and a
 * delta of today's views. It holds the links suites' advisory lock so it never
 * runs while `actions.integration.test.ts` empties `site_links`.
 */

const currentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));
// No Clerk session here; nobody is viewing as someone else.
vi.mock("@/app/lib/impersonation/viewer", () => ({
  isImpersonating: vi.fn().mockResolvedValue(false),
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseProblem = testDatabaseUrl
  ? disposableDatabaseProblem(
      testDatabaseUrl,
      process.env.GLITTER_DISPOSABLE_TEST_DB_HOSTS,
    )
  : null;
if (databaseProblem) throw new Error(databaseProblem);

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 3 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Queries = typeof import("@/app/lib/links/queries");
type StatisticsQueries = typeof import("@/app/lib/links/statistics-queries");
type ViewRoute = typeof import("@/app/api/links/view/route");
type ClickRoute = typeof import("@/app/api/links/[id]/click/route");
let queries: Queries;
let statisticsQueries: StatisticsQueries;
let viewRoute: ViewRoute;
let clickRoute: ClickRoute;
let lockClient: PoolClient | null = null;

const LABEL_PREFIX = "stats-it ";
// A day no one else writes, so totals on it are this suite's alone.
const FUTURE_NOON = new Date("2099-06-15T16:00:00Z");
const FUTURE_DAY = "2099-06-15";

let ipCounter = 0;
/** A caller of its own, so one test's rate limit is not another's. */
function freshIp() {
  ipCounter += 1;
  return `198.51.100.${ipCounter}-${Date.now()}`;
}

function viewRequest(source: string | null, ip: string) {
  const query = source == null ? "" : `?source=${encodeURIComponent(source)}`;
  return new NextRequest(`http://localhost/api/links/view${query}`, {
    method: "POST",
    headers: { "x-real-ip": ip },
  });
}

function clickRequest(id: number, source: string, ip: string) {
  return [
    new NextRequest(`http://localhost/api/links/${id}/click?source=${source}`, {
      method: "POST",
      headers: { "x-real-ip": ip },
    }),
    { params: Promise.resolve({ id: String(id) }) },
  ] as const;
}

async function addLink(
  label: string,
  overrides: Partial<typeof siteLinks.$inferInsert> = {},
) {
  const [row] = await integrationDb!
    .insert(siteLinks)
    .values({
      kind: "link",
      label: `${LABEL_PREFIX}${label}`,
      href: "/store",
      icon: "link",
      sortOrder: 1000,
      ...overrides,
    })
    .returning();
  return row;
}

async function viewsOn(day: string, source: LinksSource) {
  const [row] = await integrationDb!
    .select({ views: siteLinksDailyViews.views })
    .from(siteLinksDailyViews)
    .where(
      and(
        eq(siteLinksDailyViews.day, day),
        eq(siteLinksDailyViews.source, source),
      ),
    );
  return row?.views ?? 0;
}

async function clickRows(linkId: number) {
  return integrationDb!
    .select({
      day: siteLinksDailyClicks.day,
      source: siteLinksDailyClicks.source,
      clicks: siteLinksDailyClicks.clicks,
    })
    .from(siteLinksDailyClicks)
    .where(eq(siteLinksDailyClicks.linkId, linkId));
}

async function clickCount(id: number) {
  const [row] = await integrationDb!
    .select({ clickCount: siteLinks.clickCount })
    .from(siteLinks)
    .where(eq(siteLinks.id, id));
  return row.clickCount;
}

async function removeOwnRows() {
  const own = await integrationDb!
    .select({ id: siteLinks.id })
    .from(siteLinks)
    .where(like(siteLinks.label, `${LABEL_PREFIX}%`));
  const ids = own.map((row) => row.id);
  if (ids.length > 0) {
    await integrationDb!
      .delete(siteLinksDailyClicks)
      .where(inArray(siteLinksDailyClicks.linkId, ids));
    await integrationDb!.delete(siteLinks).where(inArray(siteLinks.id, ids));
  }
  await integrationDb!
    .delete(siteLinksDailyClicks)
    .where(gte(siteLinksDailyClicks.day, "2099-01-01"));
  await integrationDb!
    .delete(siteLinksDailyViews)
    .where(gte(siteLinksDailyViews.day, "2099-01-01"));
}

describeDatabase("site links statistics", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";

    const result = await pool!.query(
      "select 1 from information_schema.tables where table_name = 'site_links_daily_clicks'",
    );
    if (result.rowCount === 0) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
    lockClient = await pool!.connect();
    await lockClient.query("select pg_advisory_lock($1)", [LINKS_SUITE_LOCK]);

    queries = await import("@/app/lib/links/queries");
    statisticsQueries = await import("@/app/lib/links/statistics-queries");
    viewRoute = await import("@/app/api/links/view/route");
    clickRoute = await import("@/app/api/links/[id]/click/route");
    await removeOwnRows();
  }, 60_000);

  beforeEach(() => {
    currentProfileMock.mockReset();
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
  });

  afterAll(async () => {
    try {
      if (integrationDb && queries) await removeOwnRows();
    } finally {
      if (lockClient) {
        await lockClient
          .query("select pg_advisory_unlock($1)", [LINKS_SUITE_LOCK])
          .catch(() => {});
        lockClient.release();
      }
      await pool?.end();
      if (queries) {
        const appDb = await import("@/db");
        await appDb.pool.end();
      }
    }
  });

  describe("views", () => {
    it("lands on today's Bolivian day and the source sent", async () => {
      const today = linksDay(new Date());
      const before = await viewsOn(today, "tiktok");
      const response = await viewRoute.POST(viewRequest("tiktok", freshIp()));
      expect(response.status).toBe(204);
      // The day the request was made, unless it crossed midnight meanwhile.
      const after =
        (await viewsOn(today, "tiktok")) +
        (linksDay(new Date()) === today ? 0 : 1);
      expect(after).toBe(before + 1);
    });

    it("counts an unknown or missing source as other", async () => {
      const today = linksDay(new Date());
      const before = await viewsOn(today, "other");
      await viewRoute.POST(viewRequest("myspace", freshIp()));
      await viewRoute.POST(viewRequest(null, freshIp()));
      if (linksDay(new Date()) === today) {
        expect(await viewsOn(today, "other")).toBe(before + 2);
      }
    });

    it("puts a view near midnight on Bolivia's day, not UTC's", async () => {
      // 23:30 on June 15 in La Paz is 03:30 on June 16 in UTC.
      await queries.recordLinksPageView(
        "instagram",
        new Date("2099-06-16T03:30:00Z"),
      );
      await queries.recordLinksPageView(
        "instagram",
        new Date("2099-06-16T04:00:00Z"),
      );
      expect(await viewsOn("2099-06-15", "instagram")).toBe(1);
      expect(await viewsOn("2099-06-16", "instagram")).toBe(1);
    });

    it("loses no view when many land at once", async () => {
      await Promise.all(
        Array.from({ length: 40 }, () =>
          queries.recordLinksPageView("facebook", FUTURE_NOON),
        ),
      );
      expect(await viewsOn(FUTURE_DAY, "facebook")).toBe(40);
    });

    it("holds the rate limit per visitor", async () => {
      const today = linksDay(new Date());
      const ip = freshIp();
      const before = await viewsOn(today, "direct");
      for (let i = 0; i < 7; i += 1) {
        await viewRoute.POST(viewRequest("direct", ip));
      }
      await viewRoute.POST(viewRequest("direct", freshIp()));
      if (linksDay(new Date()) === today) {
        // Five for the first visitor, one for the second.
        expect(await viewsOn(today, "direct")).toBe(before + 6);
      }
    });
  });

  describe("taps", () => {
    it("adds to the lifetime count and the day's source", async () => {
      const link = await addLink("tap", { clickCount: 100 });
      const response = await clickRoute.POST(
        ...clickRequest(link.id, "instagram", freshIp()),
      );
      expect(response.status).toBe(204);
      expect(await clickCount(link.id)).toBe(101);
      expect(await clickRows(link.id)).toEqual([
        { day: linksDay(new Date()), source: "instagram", clicks: 1 },
      ]);
    });

    it("counts an unknown source as other", async () => {
      const link = await addLink("bogus source");
      await clickRoute.POST(...clickRequest(link.id, "evil", freshIp()));
      expect((await clickRows(link.id))[0].source).toBe("other");
    });

    it("puts a tap near midnight on Bolivia's day", async () => {
      const link = await addLink("midnight");
      await queries.recordSiteLinkClick(
        link.id,
        "tiktok",
        new Date("2099-06-16T03:59:00Z"),
      );
      expect(await clickRows(link.id)).toEqual([
        { day: "2099-06-15", source: "tiktok", clicks: 1 },
      ]);
    });

    it("loses no tap when many land at once", async () => {
      const link = await addLink("concurrent");
      await Promise.all(
        Array.from({ length: 30 }, () =>
          queries.recordSiteLinkClick(link.id, "direct", FUTURE_NOON),
        ),
      );
      expect(await clickCount(link.id)).toBe(30);
      expect(await clickRows(link.id)).toEqual([
        { day: FUTURE_DAY, source: "direct", clicks: 30 },
      ]);
    });

    it("does not count a hidden link or one outside its schedule", async () => {
      const hidden = await addLink("hidden", { isVisible: false });
      const ended = await addLink("ended", {
        visibleUntil: new Date(Date.now() - 60_000),
      });
      const upcoming = await addLink("upcoming", {
        visibleFrom: new Date(Date.now() + 3_600_000),
      });
      for (const link of [hidden, ended, upcoming]) {
        await clickRoute.POST(...clickRequest(link.id, "direct", freshIp()));
        expect(await clickCount(link.id)).toBe(0);
        expect(await clickRows(link.id)).toEqual([]);
      }
    });

    it("holds the rate limit per visitor and link", async () => {
      const link = await addLink("limited");
      const ip = freshIp();
      for (let i = 0; i < 8; i += 1) {
        await clickRoute.POST(...clickRequest(link.id, "direct", ip));
      }
      expect(await clickCount(link.id)).toBe(5);
      await clickRoute.POST(...clickRequest(link.id, "direct", freshIp()));
      expect(await clickCount(link.id)).toBe(6);
    });

    it("keeps a deleted link's daily rows, with no link", async () => {
      const link = await addLink("deleted");
      await queries.recordSiteLinkClick(link.id, "facebook", FUTURE_NOON);
      const [row] = await integrationDb!
        .select({ id: siteLinksDailyClicks.id })
        .from(siteLinksDailyClicks)
        .where(eq(siteLinksDailyClicks.linkId, link.id));
      await integrationDb!.delete(siteLinks).where(eq(siteLinks.id, link.id));
      const [kept] = await integrationDb!
        .select()
        .from(siteLinksDailyClicks)
        .where(eq(siteLinksDailyClicks.id, row.id));
      expect(kept).toMatchObject({
        linkId: null,
        day: FUTURE_DAY,
        source: "facebook",
        clicks: 1,
      });
    });
  });

  describe("reading the statistics", () => {
    it.each([["user"], ["artist"], [null]])("refuses role %s", async (role) => {
      currentProfileMock.mockResolvedValue(role ? { id: 2, role } : null);
      expect(
        await statisticsQueries.fetchLinksStatistics(7, FUTURE_NOON),
      ).toBeNull();
    });

    it.each([["admin"], ["festival_admin"]])(
      "gives %s the period's numbers",
      async (role) => {
        currentProfileMock.mockResolvedValue({ id: 3, role });
        const link = await addLink(`read ${role}`);
        await queries.recordLinksPageView("tiktok", FUTURE_NOON);
        await queries.recordSiteLinkClick(link.id, "tiktok", FUTURE_NOON);

        const stats = await statisticsQueries.fetchLinksStatistics(
          7,
          FUTURE_NOON,
        );
        expect(stats).not.toBeNull();
        expect(stats!.range.to).toBe(FUTURE_DAY);
        expect(stats!.daily.at(-1)!.day).toBe(FUTURE_DAY);
        expect(stats!.totals.views).toBeGreaterThan(0);
        expect(stats!.totals.ctr).not.toBeNull();
        const row = stats!.links.find((r) => r.id === link.id);
        expect(row).toMatchObject({ taps: 1, lifetime: 1, hidden: false });
        // Rows of earlier tests' deleted link are listed together.
        expect(stats!.links.some((r) => r.id === null)).toBe(true);
      },
    );
  });
});
