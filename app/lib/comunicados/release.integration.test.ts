// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

import type {
  ComunicadoAudience,
  ComunicadoMissedReason,
} from "@/app/lib/comunicados/definitions";
import type { BulkTiming } from "@/app/lib/notifications/bulk-email";
import { comunicadoNotSentBody } from "@/app/lib/notifications/kinds/comunicado";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  distributionListMembers,
  distributionLists,
  festivalDates,
  festivals,
  notificationCampaignRecipients,
  notificationCampaigns,
  notifications,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

/**
 * Releasing due schedules against a real database
 * (docs/IMPLEMENTATION-comunicados.md E2–E4, G9, F4): the claim and its send
 * in one transaction, at most three per run, each tried once; the audience
 * read at release; the races with "Cancelar programación" and "Enviar
 * ahora"; and every miss, recorded at the first failure under the version
 * read with the claim, with its bell item. Resend is mocked and there are no
 * VAPID keys, so nothing leaves the test. Other files' due schedules are
 * parked before each test, since a release takes every due one there is;
 * every assertion is about this file's own rows.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The one network call: a batch to Resend.
const sendBatchMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
  sendBatchEmails: sendBatchMock,
}));
// No VAPID keys: the driver's push step claims nothing.
vi.mock("@/app/lib/notifications/push/config", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/app/lib/notifications/push/config")
  >()),
  pushVapidConfig: () => null,
  pushPublicKey: () => null,
}));

const state = vi.hoisted(() => ({
  vercelEnv: "production",
  maxRecipients: 3_000,
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => null,
  requireAdmin: async () => null,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureEnabled: async (key: string) => key === "comunicados",
  isFeatureLaunched: async () => false,
  featureFlagGuard: async (key: string) =>
    key === "comunicados"
      ? null
      : { success: false, message: "Esta funcionalidad no está disponible" },
}));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    ...actual,
    serverEnv: new Proxy(actual.serverEnv, {
      get: (target, key) =>
        key === "VERCEL_ENV" ? state.vercelEnv : Reflect.get(target, key),
    }),
  };
});
// The cap is 3,000; a lowered one lets two fixtures cross it.
vi.mock("@/app/lib/comunicados/definitions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/comunicados/definitions")>();
  return {
    ...actual,
    get COMUNICADO_MAX_RECIPIENTS() {
      return state.maxRecipients;
    },
  };
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    return /(^|[_-])(test|ci)([_-]|$)/i.test(
      decodeURIComponent(new URL(url).pathname.slice(1)),
    );
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 4 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Release = typeof import("@/app/lib/comunicados/release");
type Schedule = typeof import("@/app/lib/comunicados/schedule");
type Send = typeof import("@/app/lib/comunicados/send");
type Drafts = typeof import("@/app/lib/comunicados/drafts");
type Driver = typeof import("@/app/lib/comunicados/driver");
type Definitions = typeof import("@/app/lib/comunicados/definitions");
let release: Release;
let schedule: Schedule;
let send: Send;
let drafts: Drafts;
let driver: Driver;
let definitions: Definitions;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const REASON = "El armado se adelanta a las 7:00 por la lluvia";
const LATER = () => Date.now() + 60_000;

/** No test waits on the production waits. */
const FAST: Partial<BulkTiming> = {
  spacingMs: 0,
  lockPollMs: 10,
  minLockTimeoutMs: 100,
  maxThrottleWaitMs: 10,
};

const created = {
  users: [] as number[],
  festivals: [] as number[],
  stands: [] as number[],
  reservations: [] as number[],
  lists: [] as number[],
  comunicados: [] as number[],
};

async function createUser(
  values: Partial<typeof users.$inferInsert> = {},
): Promise<number> {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `release-${suffix}`,
      email: `release-${suffix}@example.com`,
      displayName: `Programa ${suffix.slice(0, 8)}`,
      role: "user",
      status: "verified",
      ...values,
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

let standNumber = 9700;

/** A festival whose Confirmados list is exactly `holders`. */
async function festivalWith(
  holders: number[],
  dates: { start: Date; end: Date }[] = [
    {
      start: new Date(Date.now() + 10 * DAY),
      end: new Date(Date.now() + 11 * DAY),
    },
  ],
) {
  const [festival] = await integrationDb!
    .insert(festivals)
    .values({ name: `Programa ${randomUUID()}`, status: "active" })
    .returning({ id: festivals.id });
  created.festivals.push(festival!.id);
  await integrationDb!.insert(festivalDates).values(
    dates.map((date) => ({
      festivalId: festival!.id,
      startDate: date.start,
      endDate: date.end,
    })),
  );
  for (const owner of holders) {
    const [stand] = await integrationDb!
      .insert(stands)
      .values({ standNumber: standNumber++, festivalId: festival!.id })
      .returning({ id: stands.id });
    created.stands.push(stand!.id);
    const [reservation] = await integrationDb!
      .insert(standReservations)
      .values({
        standId: stand!.id,
        festivalId: festival!.id,
        status: "accepted",
        ownerUserId: owner,
      })
      .returning({ id: standReservations.id });
    created.reservations.push(reservation!.id);
    await integrationDb!
      .insert(reservationParticipants)
      .values({ userId: owner, reservationId: reservation!.id });
  }
  return festival!.id;
}

async function createFixedList(memberIds: number[]) {
  const [list] = await integrationDb!
    .insert(distributionLists)
    .values({ name: `Programa ${randomUUID()}`, kind: "fixed" })
    .returning({ id: distributionLists.id });
  created.lists.push(list!.id);
  await addToList(list!.id, memberIds);
  return list!.id;
}

async function addToList(listId: number, memberIds: number[]) {
  if (memberIds.length === 0) return;
  await integrationDb!
    .insert(distributionListMembers)
    .values(memberIds.map((userId) => ({ listId, userId })));
}

function audience(value: Partial<ComunicadoAudience>): ComunicadoAudience {
  return { festivals: [], lists: [], people: [], ...value };
}

/** A paragraph as `normalizeAnnouncementDoc` stores it. */
function storedParagraph(text: string) {
  return {
    type: "paragraph",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
    },
    content: [{ type: "text", text, styles: {} }],
    children: [],
  };
}

let scheduler: number;

/**
 * A comunicado as "Programar" leaves it, due a minute ago, written and
 * scheduled by this test's admin; `values` overrides any of it.
 */
async function insertScheduled(
  to: Partial<ComunicadoAudience>,
  values: Partial<typeof comunicados.$inferInsert> = {},
) {
  const [row] = await integrationDb!
    .insert(comunicados)
    .values({
      title: "Cambio de horario de armado",
      doc: [storedParagraph("El armado empieza a las 8:00.")],
      audience: audience(to),
      status: "scheduled",
      scheduledAt: new Date(Date.now() - MINUTE),
      scheduledByUserId: scheduler,
      createdByUserId: scheduler,
      updatedByUserId: scheduler,
      ...values,
    })
    .returning({ id: comunicados.id });
  created.comunicados.push(row!.id);
  return row!.id;
}

/** Someone who can receive it. */
async function toOnePerson() {
  return { people: [await createUser()] };
}

async function rowOf(id: number) {
  const [row] = await integrationDb!
    .select()
    .from(comunicados)
    .where(eq(comunicados.id, id));
  return row!;
}

async function campaignsOf(comunicadoId: number) {
  return integrationDb!
    .select()
    .from(notificationCampaigns)
    .where(
      eq(notificationCampaigns.idempotencyKey, `comunicado:${comunicadoId}`),
    );
}

async function recipientIdsOf(campaignId: number) {
  const rows = await integrationDb!
    .select({ userId: notificationCampaignRecipients.userId })
    .from(notificationCampaignRecipients)
    .where(eq(notificationCampaignRecipients.campaignId, campaignId));
  return rows.map((row) => row.userId).sort((a, b) => a - b);
}

/** `schedule_missed_at` as the dedupe key writes it. */
async function missedMsOf(id: number) {
  const { rows } = await pool!.query<{ ms: string }>(
    `SELECT floor(extract(epoch FROM schedule_missed_at) * 1000)::bigint AS ms
     FROM comunicados WHERE id = $1`,
    [id],
  );
  return Number(rows[0]!.ms);
}

type BellItem = {
  id: number;
  user_id: number;
  category: string;
  title: string;
  body: string;
  action_path: string | null;
  action_label: string | null;
  data: unknown;
  dedupe_key: string;
  read_at: Date | null;
};

async function bellItemsOf(comunicadoId: number) {
  const { rows } = await pool!.query<BellItem>(
    `SELECT id, user_id, category, title, body, action_path, action_label,
            data, dedupe_key, read_at
     FROM notifications
     WHERE kind = 'comunicado_not_sent'
       AND (data->>'comunicadoId')::int = $1
     ORDER BY user_id`,
    [comunicadoId],
  );
  return rows;
}

async function deliveryCountOf(notificationIds: number[]) {
  const { rows } = await pool!.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM notification_deliveries
     WHERE notification_id = ANY($1::int[])`,
    [notificationIds],
  );
  return rows[0]!.n;
}

/** Every global admin there is now, whatever the status. */
async function adminIds() {
  const { rows } = await pool!.query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'admin' ORDER BY id",
  );
  return rows.map((row) => row.id);
}

function releaseNow(
  opts: Partial<Parameters<Release["releaseDueComunicados"]>[0]> = {},
) {
  return release.releaseDueComunicados({ deadline: LATER(), ...opts });
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

/**
 * Resolves once some connection to this database waits on a lock another
 * holds. Files run one at a time, so it is this test's.
 */
async function waitUntilSomeoneWaits() {
  for (let attempt = 0; ; attempt += 1) {
    const { rows } = await pool!.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database()
         AND cardinality(pg_blocking_pids(pid)) > 0`,
    );
    if (rows[0]!.waiting > 0) return;
    if (attempt > 250) throw new Error("Nothing ever waited.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

let consoleLog: MockInstance<typeof console.log>;
let consoleWarn: MockInstance<typeof console.warn>;
let consoleError: MockInstance<typeof console.error>;

/** Every string a logged statement carried as a parameter (db/index.ts). */
function loggedParams() {
  return consoleLog.mock.calls.flatMap(([entry]) =>
    entry && typeof entry === "object" && "query" in entry
      ? ((entry as { params: unknown[] }).params ?? []).filter(
          (param): param is string => typeof param === "string",
        )
      : [],
  );
}

/** What the release logged for one comunicado, by line. */
function logsFor(line: string, comunicadoId: number) {
  return consoleLog.mock.calls
    .filter(
      ([first, second]) =>
        first === line &&
        (second as { comunicadoId?: number } | undefined)?.comunicadoId ===
          comunicadoId,
    )
    .map(([, second]) => second);
}

describeDatabase("releasing scheduled comunicados", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = "https://glitter.test";
    release = await import("@/app/lib/comunicados/release");
    schedule = await import("@/app/lib/comunicados/schedule");
    send = await import("@/app/lib/comunicados/send");
    drafts = await import("@/app/lib/comunicados/drafts");
    driver = await import("@/app/lib/comunicados/driver");
    definitions = await import("@/app/lib/comunicados/definitions");

    // The release writes through the app's pool: it must be this database.
    const { db } = await import("@/db");
    const { rows } = await db.execute<{ name: string }>(
      sql`SELECT current_database() AS name`,
    );
    expect(rows[0]?.name).toBe(
      decodeURIComponent(new URL(testDatabaseUrl!).pathname.slice(1)),
    );
    try {
      await integrationDb!
        .select({ id: comunicados.id, missed: comunicados.scheduleMissedAt })
        .from(comunicados)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(async () => {
    // A release takes every due schedule, oldest first: other files' rows
    // would use up its three.
    await pool!.query(
      `UPDATE comunicados SET scheduled_at = now() + interval '30 days'
       WHERE status = 'scheduled' AND scheduled_at <= now()`,
    );
    sendBatchMock.mockReset();
    sendBatchMock.mockImplementation(async (emails: unknown[]) => ({
      data: {
        data: emails.map(() => ({ id: `re_${randomUUID()}` })),
        errors: [],
      },
      error: null,
      headers: {},
    }));
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    scheduler = await createUser({ role: "admin" });
  });

  async function cleanUp() {
    const db = integrationDb!;
    if (created.comunicados.length > 0) {
      // Bell items go to admins outside this file too.
      await pool!.query(
        `DELETE FROM notifications
         WHERE kind = 'comunicado_not_sent'
           AND (data->>'comunicadoId')::int = ANY($1::int[])`,
        [created.comunicados],
      );
      const sent = await db
        .select({ campaignId: comunicados.campaignId })
        .from(comunicados)
        .where(inArray(comunicados.id, created.comunicados));
      const campaignIds = sent.flatMap((row) =>
        row.campaignId === null ? [] : [row.campaignId],
      );
      if (campaignIds.length > 0) {
        // Deliveries go with their inbox item.
        await db
          .delete(notifications)
          .where(inArray(notifications.campaignId, campaignIds));
      }
      await db
        .delete(comunicadoRevisions)
        .where(inArray(comunicadoRevisions.comunicadoId, created.comunicados));
      await db
        .delete(comunicados)
        .where(inArray(comunicados.id, created.comunicados));
      if (campaignIds.length > 0) {
        // Recipients cascade.
        await db
          .delete(notificationCampaigns)
          .where(inArray(notificationCampaigns.id, campaignIds));
      }
    }
    if (created.lists.length > 0) {
      await db
        .delete(distributionLists)
        .where(inArray(distributionLists.id, created.lists));
    }
    if (created.reservations.length > 0) {
      await db
        .delete(standReservations)
        .where(inArray(standReservations.id, created.reservations));
    }
    if (created.stands.length > 0) {
      await db.delete(stands).where(inArray(stands.id, created.stands));
    }
    if (created.users.length > 0) {
      await db.delete(users).where(inArray(users.id, created.users));
    }
    if (created.festivals.length > 0) {
      await db
        .delete(festivals)
        .where(inArray(festivals.id, created.festivals));
    }
    for (const ids of Object.values(created)) ids.length = 0;
  }

  afterEach(async () => {
    // Read before cleanup, assert after it, so a failure still cleans up.
    const errors = consoleError.mock.calls.map((args) =>
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" "),
    );
    const lines = JSON.stringify([
      ...consoleWarn.mock.calls,
      ...consoleLog.mock.calls.filter((args) =>
        String(args[0]).startsWith("[comunicados]"),
      ),
    ]);
    const params = loggedParams();
    vi.restoreAllMocks();
    state.vercelEnv = "production";
    state.maxRecipients = 3_000;
    await cleanUp();
    // A test that expects an error checks it and clears it.
    expect(errors).toEqual([]);
    // Logs carry ids, codes and counts; no address is ever a parameter.
    expect(lines).not.toContain("@");
    expect(params.filter((param) => param.includes("@example.com"))).toEqual(
      [],
    );
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    const { pool: appPool } = await import("@/db");
    await appPool.end();
  });

  describe("releasing (E2, E3)", () => {
    it("releases a due schedule in the lane's run, as whoever scheduled it", async () => {
      const ana = await createUser();
      const id = await insertScheduled({ people: [ana] });

      const result = await driver.runComunicadoWork({
        scope: "lane",
        deadline: LATER(),
        trigger: "cron",
        emailTiming: FAST,
      });

      expect(result.released).toBeGreaterThanOrEqual(1);
      expect(result.failedSteps).toEqual([]);
      const row = await rowOf(id);
      expect(row).toMatchObject({
        status: "sent",
        version: 2,
        currentRevision: 1,
        sentByUserId: scheduler,
      });
      const [campaign] = await campaignsOf(id);
      expect(campaign!.id).toBe(row.campaignId);
      expect(await recipientIdsOf(campaign!.id)).toEqual([ana]);
      expect(logsFor("[comunicados] send", id)).toEqual([
        {
          comunicadoId: id,
          eligible: 1,
          skipped: 0,
          narrowed: false,
          trigger: "schedule",
        },
      ]);
    });

    it("releases at most three per run, oldest first, and leaves the rest for the next", async () => {
      const ids: number[] = [];
      for (const minutesAgo of [4, 3, 2, 1]) {
        ids.push(
          await insertScheduled(await toOnePerson(), {
            scheduledAt: new Date(Date.now() - minutesAgo * MINUTE),
          }),
        );
      }

      const run = await releaseNow();

      expect(run.triedIds).toEqual(ids.slice(0, 3));
      expect(run.campaignIds).toHaveLength(3);
      expect(await rowOf(ids[3]!)).toMatchObject({ status: "scheduled" });

      const next = await releaseNow();
      expect(next.triedIds).toEqual([ids[3]]);
      expect(await rowOf(ids[3]!)).toMatchObject({ status: "sent" });
    });

    it("releases nothing when the deadline leaves no room", async () => {
      const id = await insertScheduled(await toOnePerson());

      const run = await releaseNow({ deadline: Date.now() + 5_000 });

      expect(run).toEqual({
        released: 0,
        missed: 0,
        failed: 0,
        campaignIds: [],
        triedIds: [],
      });
      expect(await rowOf(id)).toMatchObject({ status: "scheduled" });
    });

    it("sends one campaign when two runs overlap: the second skips the claimed row", async () => {
      const id = await insertScheduled(await toOnePerson());
      const claimed = gate();
      const held = gate();

      const first = releaseNow({
        onClaimed: async () => {
          claimed.open();
          await held.opened;
        },
      });
      await claimed.opened;
      const second = await releaseNow();
      held.open();
      const firstRun = await first;

      expect(second.triedIds).not.toContain(id);
      expect(firstRun.triedIds).toEqual([id]);
      expect(firstRun.released).toBe(1);
      expect(await campaignsOf(id)).toHaveLength(1);
      // Once committed, it is no longer due.
      expect((await releaseNow()).triedIds).not.toContain(id);
    });

    it("computes the audience at release: someone added after scheduling gets it (E3)", async () => {
      const ana = await createUser();
      const listId = await createFixedList([ana]);
      const id = await insertScheduled({ lists: [listId] });
      const bruno = await createUser();
      await addToList(listId, [bruno]);

      await releaseNow();

      const { campaignId } = await rowOf(id);
      expect(await recipientIdsOf(campaignId!)).toEqual(
        [ana, bruno].sort((a, b) => a - b),
      );
    });

    it("leaves one that fails unexpectedly scheduled, tries it once, and still releases the next (E2)", async () => {
      const broken = await insertScheduled(await toOnePerson(), {
        scheduledAt: new Date(Date.now() - 2 * MINUTE),
      });
      const next = await insertScheduled(await toOnePerson());
      const claims: number[] = [];

      const run = await releaseNow({
        onClaimed: async (id) => {
          claims.push(id);
          if (id === broken) throw new Error("boom");
        },
      });

      expect(claims.filter((id) => id === broken)).toHaveLength(1);
      expect(run.triedIds.slice(0, 2)).toEqual([broken, next]);
      expect(run.failed).toBe(1);
      expect(await rowOf(broken)).toMatchObject({
        status: "scheduled",
        version: 1,
        campaignId: null,
        scheduleMissedAt: null,
      });
      expect(await rowOf(next)).toMatchObject({ status: "sent" });
      expect(await bellItemsOf(broken)).toEqual([]);
      expect(consoleError).toHaveBeenCalledWith(
        "[comunicados] release failed",
        { comunicadoId: broken, errorType: "Error", code: null },
      );
      consoleError.mockClear();
    });

    it.each(["NOT_FOUND", "STALE", "AUDIENCE_CHANGED"] as const)(
      "leaves it scheduled on a %s refusal, which is no miss",
      async (code) => {
        const id = await insertScheduled(await toOnePerson());

        const run = await releaseNow({
          onClaimed: async () => {
            throw new send.SendRefusal(code, "No debería pasar.");
          },
        });

        expect(run.triedIds).toEqual([id]);
        expect(run.failed).toBe(1);
        expect(await rowOf(id)).toMatchObject({
          status: "scheduled",
          version: 1,
          scheduleMissedAt: null,
        });
        expect(await bellItemsOf(id)).toEqual([]);
        expect(consoleError).toHaveBeenCalledWith(
          "[comunicados] release failed",
          { comunicadoId: id, errorType: "SendRefusal", code },
        );
        consoleError.mockClear();
      },
    );

    it("fails the driver's step on an error before any claim, and the run goes on", async () => {
      const id = await insertScheduled(await toOnePerson());
      const { db } = await import("@/db");
      vi.spyOn(db, "transaction").mockRejectedValueOnce(
        new Error("connection lost"),
      );

      const result = await driver.runComunicadoWork({
        scope: "lane",
        deadline: LATER(),
        trigger: "cron",
        emailTiming: FAST,
      });

      expect(result).toMatchObject({ released: 0, missed: 0 });
      expect(result.failedSteps).toEqual(["release"]);
      expect(await rowOf(id)).toMatchObject({ status: "scheduled" });
      expect(consoleError).toHaveBeenCalledWith(
        "[comunicados] work step failed",
        { trigger: "cron", step: "release", errorType: "Error", code: null },
      );
      consoleError.mockClear();
    });

    it("releases nothing from a lane run in development (K9)", async () => {
      state.vercelEnv = "development";
      const id = await insertScheduled(await toOnePerson());

      const result = await driver.runComunicadoWork({
        scope: "lane",
        deadline: LATER(),
        trigger: "cron",
        emailTiming: FAST,
      });

      expect(result).toMatchObject({ released: 0, missed: 0 });
      expect(await rowOf(id)).toMatchObject({
        status: "scheduled",
        version: 1,
      });
    });
  });

  describe("races (E1, F4)", () => {
    it("cancel ∥ release: a cancel that waits on the release hears it went out", async () => {
      const id = await insertScheduled(await toOnePerson());
      const claimed = gate();
      const held = gate();

      const releasing = releaseNow({
        onClaimed: async () => {
          claimed.open();
          await held.opened;
        },
      });
      await claimed.opened;
      const cancelling = schedule.cancelComunicadoSchedule({
        comunicadoId: id,
        by: scheduler,
      });
      await waitUntilSomeoneWaits();
      held.open();
      const [run, cancel] = await Promise.all([releasing, cancelling]);

      expect(run.released).toBe(1);
      expect(cancel).toEqual({
        ok: false,
        code: "NOT_SCHEDULED",
        message: "Ya se empezó a enviar. Si no querés que llegue, retiralo.",
      });
      expect(await rowOf(id)).toMatchObject({
        status: "sent",
        sentByUserId: scheduler,
      });
    });

    it("cancel ∥ release: a cancel that committed first is never released", async () => {
      const id = await insertScheduled(await toOnePerson());

      expect(
        await schedule.cancelComunicadoSchedule({
          comunicadoId: id,
          by: scheduler,
        }),
      ).toMatchObject({ ok: true, alreadyDraft: false });
      const run = await releaseNow();

      expect(run.triedIds).not.toContain(id);
      expect(await rowOf(id)).toMatchObject({
        status: "draft",
        scheduledAt: null,
      });
      expect(await campaignsOf(id)).toEqual([]);
    });

    it("«Enviar ahora» ∥ release: waiting on the release, it hears it is on its way", async () => {
      const id = await insertScheduled(await toOnePerson());
      const claimed = gate();
      const held = gate();

      const releasing = releaseNow({
        onClaimed: async () => {
          claimed.open();
          await held.opened;
        },
      });
      await claimed.opened;
      const sending = send.sendComunicadoNow({
        comunicadoId: id,
        by: scheduler,
        expectedVersion: 1,
        typedCount: null,
      });
      await waitUntilSomeoneWaits();
      held.open();
      const [run, now] = await Promise.all([releasing, sending]);

      expect(run.campaignIds).toHaveLength(1);
      expect(now).toEqual({
        kind: "already_sent",
        comunicadoId: id,
        campaignId: run.campaignIds[0],
      });
      expect(await campaignsOf(id)).toHaveLength(1);
    });

    it("«Enviar ahora» ∥ release: a release skips the row a send holds, and then finds it sent", async () => {
      const id = await insertScheduled(await toOnePerson());
      const holder: PoolClient = await pool!.connect();
      try {
        await holder.query("BEGIN");
        await holder.query(
          "SELECT id FROM comunicados WHERE id = $1 FOR UPDATE",
          [id],
        );
        const skipped = await releaseNow();
        expect(skipped.triedIds).not.toContain(id);
      } finally {
        await holder.query("ROLLBACK").catch(() => undefined);
        holder.release();
      }

      const now = await send.sendComunicadoNow({
        comunicadoId: id,
        by: scheduler,
        expectedVersion: 1,
        typedCount: null,
      });
      expect(now.kind).toBe("started");
      expect((await releaseNow()).triedIds).not.toContain(id);
      expect(await campaignsOf(id)).toHaveLength(1);
    });
  });

  describe("misses (E4, G9)", () => {
    it("keeps a change of date committed after the release failed: no miss, no bell item", async () => {
      const former = await createUser({ role: "admin" });
      const id = await insertScheduled(await toOnePerson(), {
        scheduledByUserId: former,
      });
      await pool!.query("UPDATE users SET role = 'user' WHERE id = $1", [
        former,
      ]);
      const newDate = new Date(Date.now() + DAY);

      const run = await releaseNow({
        beforeMiss: async (comunicadoId) => {
          expect(
            await schedule.rescheduleComunicado({
              comunicadoId,
              by: scheduler,
              expectedVersion: 1,
              scheduledAt: newDate,
            }),
          ).toMatchObject({ ok: true, version: 2 });
        },
      });

      expect(run.triedIds).toContain(id);
      expect(logsFor("[comunicados] release missed", id)).toEqual([]);
      expect(await rowOf(id)).toMatchObject({
        status: "scheduled",
        version: 2,
        scheduledAt: newDate,
        scheduleMissedAt: null,
        scheduleMissedReason: null,
      });
      expect(await bellItemsOf(id)).toEqual([]);
    });

    type MissCase = {
      reason: ComunicadoMissedReason;
      /** The comunicado, its detail clause, and who should hear about it. */
      make: () => Promise<{
        id: number;
        detail: string | null;
        notify: () => Promise<number[]>;
      }>;
      audienceCount: number | null;
    };

    const onlyScheduler = async () => [scheduler];

    const CASES: [string, MissCase][] = [
      [
        "late, more than an hour after its time",
        {
          reason: "late",
          make: async () => ({
            id: await insertScheduled(await toOnePerson(), {
              scheduledAt: new Date(Date.now() - 61 * MINUTE),
            }),
            detail: null,
            notify: onlyScheduler,
          }),
          audienceCount: null,
        },
      ],
      [
        "too large",
        {
          reason: "too_large",
          make: async () => {
            state.maxRecipients = 1;
            return {
              id: await insertScheduled({
                people: [await createUser(), await createUser()],
              }),
              detail: "la audiencia sumaba 2 personas y el máximo es 1",
              notify: onlyScheduler,
            };
          },
          audienceCount: 2,
        },
      ],
      [
        "empty",
        {
          reason: "empty",
          make: async () => ({
            id: await insertScheduled({
              festivals: [
                await festivalWith([await createUser({ status: "banned" })]),
              ],
            }),
            detail: null,
            notify: onlyScheduler,
          }),
          audienceCount: 0,
        },
      ],
      [
        "invalid: a list whose filter no longer parses",
        {
          reason: "invalid",
          make: async () => {
            const name = `Ilustradores ${randomUUID().slice(0, 8)}`;
            const [list] = await integrationDb!
              .insert(distributionLists)
              .values({
                name,
                kind: "filter",
                filter: { v: 2, areas: ["painting"] },
              })
              .returning({ id: distributionLists.id });
            created.lists.push(list!.id);
            return {
              id: await insertScheduled({ lists: [list!.id] }),
              detail: `la lista «${name}» tiene un filtro que ya no se puede leer`,
              notify: onlyScheduler,
            };
          },
          audienceCount: null,
        },
      ],
      [
        "invalid: essential, to a festival that ended more than 7 days ago",
        {
          reason: "invalid",
          make: async () => {
            const festival = await festivalWith(
              [await createUser()],
              [
                {
                  start: new Date(Date.now() - 9 * DAY),
                  end: new Date(Date.now() - 8 * DAY),
                },
              ],
            );
            return {
              id: await insertScheduled(
                { festivals: [festival] },
                {
                  essential: true,
                  essentialReason: REASON,
                  essentialConfirmedByUserId: scheduler,
                  essentialConfirmedAt: new Date(Date.now() - DAY),
                },
              ),
              detail: "el festival ya terminó y no puede ser esencial",
              notify: onlyScheduler,
            };
          },
          audienceCount: null,
        },
      ],
      [
        "sender_not_admin, to every admin",
        {
          reason: "sender_not_admin",
          make: async () => {
            const former = await createUser({ role: "admin" });
            const id = await insertScheduled(await toOnePerson(), {
              scheduledByUserId: former,
            });
            // Another admin of this file, banned: still a global admin.
            await createUser({ role: "admin", status: "banned" });
            await pool!.query("UPDATE users SET role = 'user' WHERE id = $1", [
              former,
            ]);
            return { id, detail: null, notify: adminIds };
          },
          audienceCount: null,
        },
      ],
    ];

    it.each(CASES)(
      "turns it back into a draft at the first failure: %s",
      async (_label, { reason, make, audienceCount }) => {
        const { id, detail, notify } = await make();
        const before = await rowOf(id);

        const run = await releaseNow();

        expect(run.triedIds.filter((tried) => tried === id)).toEqual([id]);
        expect(logsFor("[comunicados] release missed", id)).toEqual([
          { comunicadoId: id, reason },
        ]);
        const sentence = comunicadoNotSentBody({
          comunicadoId: id,
          title: "",
          reason,
          detail,
          scheduledAt: before.scheduledAt!.toISOString(),
          audienceCount,
        });
        const row = await rowOf(id);
        expect(row).toMatchObject({
          status: "draft",
          version: before.version + 1,
          scheduledAt: null,
          // Kept: the draft says who had scheduled it.
          scheduledByUserId: before.scheduledByUserId,
          scheduleMissedReason: reason,
          scheduleMissedDetail: sentence,
          essentialConfirmedByUserId: null,
          essentialConfirmedAt: null,
          campaignId: null,
        });
        expect(row.scheduleMissedAt).toBeInstanceOf(Date);
        expect(await campaignsOf(id)).toEqual([]);

        const recipients = await notify();
        expect(recipients.length).toBeGreaterThan(0);
        const items = await bellItemsOf(id);
        expect(items.map((item) => item.user_id)).toEqual(recipients);
        const dedupeKey = `comunicado-not-sent:${id}:${await missedMsOf(id)}`;
        for (const item of items) {
          expect(item).toMatchObject({
            category: "admin",
            title: "No se envió «Cambio de horario de armado»",
            body: sentence,
            action_path: `/dashboard/communications/${id}`,
            action_label: "Ver comunicado",
            dedupe_key: dedupeKey,
            read_at: null,
            data: {
              comunicadoId: id,
              title: "Cambio de horario de armado",
              reason,
              detail,
              scheduledAt: before.scheduledAt!.toISOString(),
              audienceCount,
            },
          });
        }
        // In the app only: no email, no push.
        expect(await deliveryCountOf(items.map((item) => item.id))).toBe(0);
        // Recorded once: the next run finds a draft.
        expect((await releaseNow()).triedIds).not.toContain(id);
        expect(await bellItemsOf(id)).toHaveLength(items.length);
      },
    );

    it("records a miss only at the version read with the claim, and says who it told", async () => {
      const id = await insertScheduled(await toOnePerson());
      const { scheduledAt } = await rowOf(id);
      const miss = (version: number) =>
        release.recordScheduleMiss({
          comunicadoId: id,
          version,
          scheduledAt: scheduledAt!,
          refusal: {
            code: "NO_ELIGIBLE_RECIPIENTS",
            message: "Nadie de esta audiencia puede recibirlo.",
            eligible: 0,
          },
        });

      expect(await miss(2)).toEqual({ recorded: false, notifiedUserIds: [] });
      expect(await rowOf(id)).toMatchObject({
        status: "scheduled",
        version: 1,
      });

      expect(await miss(1)).toEqual({
        recorded: true,
        notifiedUserIds: [scheduler],
      });
      // Already a draft: a second call records nothing more.
      expect(await miss(2)).toEqual({ recorded: false, notifiedUserIds: [] });
      expect(await bellItemsOf(id)).toHaveLength(1);
    });

    it("tells only the scheduler while still an admin, and every admin once not", async () => {
      const other = await createUser({ role: "admin" });
      const late = await insertScheduled(await toOnePerson(), {
        scheduledAt: new Date(Date.now() - 61 * MINUTE),
      });

      await releaseNow();

      const items = await bellItemsOf(late);
      expect(items.map((item) => item.user_id)).toEqual([scheduler]);
      expect(await adminIds()).toContain(other);

      const former = await createUser({ role: "admin" });
      const demoted = await insertScheduled(await toOnePerson(), {
        scheduledByUserId: former,
      });
      await pool!.query("UPDATE users SET role = 'user' WHERE id = $1", [
        former,
      ]);
      await releaseNow();
      const everyone = (await bellItemsOf(demoted)).map((item) => item.user_id);
      expect(everyone).toEqual(expect.arrayContaining([scheduler, other]));
      expect(everyone).not.toContain(former);
    });

    it("leaves a missed essential draft free to untick essential", async () => {
      const festival = await festivalWith(
        [await createUser()],
        [
          {
            start: new Date(Date.now() - 9 * DAY),
            end: new Date(Date.now() - 8 * DAY),
          },
        ],
      );
      const id = await insertScheduled(
        { festivals: [festival] },
        {
          essential: true,
          essentialReason: REASON,
          essentialConfirmedByUserId: scheduler,
          essentialConfirmedAt: new Date(Date.now() - DAY),
        },
      );
      await releaseNow();
      const missed = await rowOf(id);
      expect(missed).toMatchObject({
        status: "draft",
        scheduleMissedReason: "invalid",
      });

      const saved = await drafts.saveComunicadoDraft(
        definitions.ComunicadoDraftSchema.parse({
          comunicadoId: id,
          expectedVersion: missed.version,
          saveKey: randomUUID(),
          title: missed.title,
          doc: missed.doc,
          actionLabel: null,
          actionPath: null,
          sendEmail: true,
          sendPush: false,
          audience: missed.audience,
          essential: false,
          essentialReason: null,
        }),
        scheduler,
      );

      expect(saved).toMatchObject({ ok: true, version: missed.version + 1 });
      expect(await rowOf(id)).toMatchObject({
        essential: false,
        essentialConfirmedAt: null,
      });
    });

    it("sends a missed draft with «Enviar ahora», clearing the miss (D1)", async () => {
      const id = await insertScheduled(await toOnePerson(), {
        scheduledAt: new Date(Date.now() - 61 * MINUTE),
      });
      await releaseNow();
      const missed = await rowOf(id);
      expect(missed).toMatchObject({
        status: "draft",
        scheduleMissedReason: "late",
      });

      const now = await send.sendComunicadoNow({
        comunicadoId: id,
        by: scheduler,
        expectedVersion: missed.version,
        typedCount: null,
      });

      expect(now.kind).toBe("started");
      expect(await rowOf(id)).toMatchObject({
        status: "sent",
        scheduleMissedAt: null,
        scheduleMissedReason: null,
        scheduleMissedDetail: null,
      });
    });
  });
});
