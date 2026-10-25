// @vitest-environment node

import { randomUUID } from "crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
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
  BulkEmailRenderer,
  BulkEmailRun,
  BulkTiming,
} from "@/app/lib/notifications/bulk-email";
import * as schema from "@/db/schema";
import {
  notificationCampaigns,
  notificationDeliveries,
  notifications,
  users,
} from "@/db/schema";

/**
 * The bulk email lane (D3 of the phase 3 design) against a real database:
 * expiry, the claim and its committed key, the lane's try-lock and spacing,
 * the renderer hooks, every row of the outcome table, and handing a claim
 * back. No producer writes bulk rows yet, so the tests insert campaigns,
 * inbox items and deliveries directly, under a fixture template whose
 * renderer is defined here. Resend is mocked; reading its answers is real.
 *
 * Every test watches console.error, and every row it asserts on is its own.
 */

vi.mock("server-only", () => ({}));
// The one network call: a batch to Resend.
const sendBatchMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({ sendBatchEmails: sendBatchMock }));

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
  ? new Pool({ connectionString: testDatabaseUrl, max: 10 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type BulkEmail = typeof import("@/app/lib/notifications/bulk-email");
let bulk: BulkEmail;

const TEMPLATE = "bulk_it_fixture";
/** The fixture's content lock; distinct from the lane's and the app's. */
const FIXTURE_LOCK_NAMESPACE = 7045;

type Delivery = typeof notificationDeliveries.$inferSelect;
type BatchCall = {
  key: string;
  validation: string | undefined;
  to: string[];
  startedAt: number;
  endedAt: number;
};
type PrepareCall = {
  campaignId: number;
  ids: number[];
  heldContentLock: boolean;
  heldLaneLock: boolean;
};

/** What the fixture renderer does, per campaign; reset before each test. */
const fixture = {
  campaigns: new Set<number>(),
  revisions: new Map<number, number>(),
  throwFor: new Set<number>(),
  transientFor: new Set<number>(),
  statementTimeoutMs: null as number | null,
  prepares: [] as PrepareCall[],
};

const renderer: BulkEmailRenderer = {
  scope: () => inArray(notifications.campaignId, [...fixture.campaigns]),
  async lockContent(tx, campaignId) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock_shared(${FIXTURE_LOCK_NAMESPACE}, ${campaignId})`,
    );
  },
  async prepare(tx, campaignId, rows) {
    const { rows: locks } = await tx.execute<{
      content: boolean;
      lane: boolean;
    }>(sql`
      SELECT
        bool_or(classid = ${FIXTURE_LOCK_NAMESPACE} AND objid = ${campaignId} AND mode = 'ShareLock') AS content,
        bool_or(classid = ${bulk.BULK_LANE_LOCK_NAMESPACE} AND objid = 0 AND mode = 'ExclusiveLock') AS lane
      FROM pg_locks
      WHERE locktype = 'advisory' AND objsubid = 2 AND granted AND pid = pg_backend_pid()`);
    fixture.prepares.push({
      campaignId,
      ids: rows.map((row) => row.id),
      heldContentLock: locks[0]?.content === true,
      heldLaneLock: locks[0]?.lane === true,
    });
    if (fixture.throwFor.has(campaignId)) {
      throw new Error("Fixture renderer failed for ana@example.test");
    }
    if (fixture.transientFor.has(campaignId)) {
      throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
    }
    if (fixture.statementTimeoutMs != null) {
      await tx.execute(
        sql.raw(`SET LOCAL statement_timeout = ${fixture.statementTimeoutMs}`),
      );
    }

    const skipped: { id: number; code: string }[] = [];
    const failed: { id: number; code: string }[] = [];
    const emails: {
      id: number;
      email: {
        from: string;
        to: string[];
        subject: string;
        html: string;
        text: string;
      };
      revision: number;
    }[] = [];
    for (const row of rows) {
      const payload = row.payload as { skip?: string; fail?: string };
      if (payload.skip) skipped.push({ id: row.id, code: payload.skip });
      else if (payload.fail) failed.push({ id: row.id, code: payload.fail });
      else {
        emails.push({
          id: row.id,
          email: {
            from: "Productora Glitter <anuncios@example.test>",
            to: [row.recipientEmail!],
            subject: `Comunicado ${campaignId}`,
            html: "<p>Hola</p>",
            text: "Hola",
          },
          revision: fixture.revisions.get(campaignId) ?? 1,
        });
      }
    }
    return { skipped, failed, emails };
  },
};

const RENDERERS = { [TEMPLATE]: renderer };

/** No test waits on the production waits. */
const FAST: Partial<BulkTiming> = {
  spacingMs: 0,
  lockPollMs: 10,
  minLockTimeoutMs: 100,
  maxThrottleWaitMs: 10,
};

function runLane(
  overrides: {
    campaignId?: number;
    deadline?: number;
    timing?: Partial<BulkTiming>;
  } = {},
): Promise<BulkEmailRun> {
  return bulk.sendBulkEmails({
    deadline: Date.now() + 60_000,
    renderers: RENDERERS,
    ...overrides,
    timing: { ...FAST, ...overrides.timing },
  });
}

const batchCalls: BatchCall[] = [];

type BatchPayload = { to: string[] }[];
type BatchOptions = { idempotencyKey: string; batchValidation?: string };

/** Resend's answer for each request, in order; the last one repeats. */
function answerWith(
  ...answers: ((payload: BatchPayload, options: BatchOptions) => unknown)[]
) {
  let next = 0;
  sendBatchMock.mockImplementation(
    async (payload: BatchPayload, options: BatchOptions) => {
      const startedAt = Date.now();
      const answer = answers[Math.min(next, answers.length - 1)]!;
      next += 1;
      try {
        return await answer(payload, options);
      } finally {
        batchCalls.push({
          key: options.idempotencyKey,
          validation: options.batchValidation,
          to: payload.flatMap((email) => email.to),
          startedAt,
          endedAt: Date.now(),
        });
      }
    },
  );
}

function accepted(payload: BatchPayload) {
  return {
    data: {
      data: payload.map(() => ({ id: `re_${randomUUID()}` })),
      errors: [],
    },
    error: null,
    headers: {},
  };
}

function refusal(
  name: string,
  statusCode: number,
  headers: Record<string, string> = {},
) {
  return {
    data: null,
    // Resend's messages can echo an address; none may reach a log or a row.
    error: { name, message: `ana@example.test: ${name}`, statusCode },
    headers,
  };
}

const createdUserIds: number[] = [];
const createdCampaignIds: number[] = [];

async function createCampaign({ inScope = true } = {}) {
  const [campaign] = await integrationDb!
    .insert(notificationCampaigns)
    .values({
      type: "credit_gift",
      title: "Cambio de horario",
      message: "El armado empieza a las 9.",
      idempotencyKey: randomUUID(),
    })
    .returning({ id: notificationCampaigns.id });
  createdCampaignIds.push(campaign!.id);
  if (inScope) fixture.campaigns.add(campaign!.id);
  return campaign!.id;
}

/**
 * `count` bulk emails of one campaign, each to its own participant with its
 * own inbox item, oldest first. `overrides` sets delivery columns directly,
 * as an earlier attempt would have left them.
 */
async function queueEmails(
  campaignId: number,
  count: number,
  overrides: Partial<typeof notificationDeliveries.$inferInsert> = {},
): Promise<Delivery[]> {
  const db = integrationDb!;
  const people = await db
    .insert(users)
    .values(
      Array.from({ length: count }, () => {
        const suffix = randomUUID();
        return {
          clerkId: `bulk-it-${suffix}`,
          email: `bulk-it-${suffix}@example.test`,
          displayName: `Ana ${suffix}`,
          firstName: "Ana",
          lastName: "Ilustra",
          role: "user" as const,
          status: "verified" as const,
          category: "illustration" as const,
        };
      }),
    )
    .returning({ id: users.id, email: users.email });
  createdUserIds.push(...people.map((person) => person.id));

  const items = await db
    .insert(notifications)
    .values(
      people.map((person) => ({
        userId: person.id,
        kind: "bulk_it",
        category: "announcements" as const,
        title: "Cambio de horario",
        body: "El armado empieza a las 9.",
        campaignId,
        dedupeKey: `bulk-it:${campaignId}`,
      })),
    )
    .returning({ id: notifications.id, userId: notifications.userId });
  const emailOf = new Map(people.map((person) => [person.id, person.email]));

  const rows = await db
    .insert(notificationDeliveries)
    .values(
      items
        .sort((a, b) => a.id - b.id)
        .map((item) => ({
          notificationId: item.id,
          userId: item.userId,
          templateKey: TEMPLATE,
          channel: "email" as const,
          lane: "bulk" as const,
          recipientEmail: emailOf.get(item.userId)!,
          payload: {},
          idempotencyKey: `notification:${item.id}:email`,
          ...overrides,
        })),
    )
    .returning();
  return rows.sort((a, b) => a.id - b.id);
}

async function rowsOf(list: readonly { id: number }[]) {
  return integrationDb!
    .select()
    .from(notificationDeliveries)
    .where(
      inArray(
        notificationDeliveries.id,
        list.map((row) => row.id),
      ),
    )
    .orderBy(asc(notificationDeliveries.id));
}

async function setRows(
  list: readonly { id: number }[],
  values: Partial<typeof notificationDeliveries.$inferInsert>,
) {
  await integrationDb!
    .update(notificationDeliveries)
    .set(values)
    .where(
      inArray(
        notificationDeliveries.id,
        list.map((row) => row.id),
      ),
    );
}

/** Makes rows due again, as their backoff running out would. */
async function makeDue(list: readonly { id: number }[]) {
  await setRows(list, { nextAttemptAt: sql`now() - interval '1 second'` });
}

async function databaseNow() {
  const { rows } = await pool!.query<{ now: string }>(
    "SELECT (now() AT TIME ZONE 'UTC')::text AS now",
  );
  return new Date(`${rows[0]!.now.replace(" ", "T")}Z`).getTime();
}

/** `at` is about `seconds` after the database's now. */
function expectSecondsAfter(
  at: Date | null,
  dbNow: number,
  seconds: number,
  slack = 5,
) {
  expect(at).not.toBeNull();
  expect(Math.abs((at!.getTime() - dbNow) / 1000 - seconds)).toBeLessThan(
    slack,
  );
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function keyPattern(campaignId: number) {
  return new RegExp(`^${TEMPLATE}-batch:${campaignId}:${UUID}$`);
}

/**
 * A second connection holding a transaction open, for lock tests. Let go by
 * the returned function, or after `maxMs` so a failing test cannot hang the
 * lane behind it.
 */
async function holdTransaction(
  statement: string,
  params: unknown[] = [],
  maxMs = 5_000,
) {
  const client: PoolClient = await pool!.connect();
  await client.query("BEGIN");
  await client.query(statement, params);
  let released: Promise<void> | null = null;
  const release = () =>
    (released ??= client
      .query("ROLLBACK")
      .then(() => undefined)
      .finally(() => client.release()));
  const timer = setTimeout(() => void release(), maxMs);
  return () => {
    clearTimeout(timer);
    return release();
  };
}

async function cleanUp() {
  const db = integrationDb!;
  if (createdUserIds.length > 0) {
    // Deliveries go with their inbox item.
    await db
      .delete(notifications)
      .where(inArray(notifications.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  if (createdCampaignIds.length > 0) {
    await db
      .delete(notificationCampaigns)
      .where(inArray(notificationCampaigns.id, createdCampaignIds));
  }
  createdUserIds.length = 0;
  createdCampaignIds.length = 0;
}

describeDatabase("the bulk email lane", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleWarn: MockInstance<typeof console.warn>;
  let consoleLog: MockInstance<typeof console.log>;

  /** console.error lines a test expects, read and cleared. */
  function takeErrors() {
    const lines = consoleError.mock.calls.map((args) =>
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" "),
    );
    consoleError.mockClear();
    return lines;
  }

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    bulk = await import("@/app/lib/notifications/bulk-email");

    // The lane writes through the app's pool: it must be this database.
    const { db } = await import("@/db");
    const { rows } = await db.execute<{ name: string }>(
      sql`SELECT current_database() AS name`,
    );
    expect(rows[0]?.name).toBe(
      decodeURIComponent(new URL(testDatabaseUrl!).pathname.slice(1)),
    );
    try {
      await integrationDb!
        .select({ batchKey: notificationDeliveries.batchKey })
        .from(notificationDeliveries)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(() => {
    fixture.campaigns.clear();
    fixture.revisions.clear();
    fixture.throwFor.clear();
    fixture.transientFor.clear();
    fixture.statementTimeoutMs = null;
    fixture.prepares.length = 0;
    batchCalls.length = 0;
    sendBatchMock.mockReset();
    answerWith(accepted);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The app's `db` logs every statement; the lane goes through it.
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Read before cleanup, assert after it, so a failure still cleans up.
    const errors = takeErrors();
    const logged = JSON.stringify([
      ...consoleWarn.mock.calls,
      ...consoleLog.mock.calls.filter((args) =>
        String(args[0]).startsWith("[comunicados]"),
      ),
    ]);
    consoleError.mockRestore();
    consoleWarn.mockRestore();
    consoleLog.mockRestore();
    await cleanUp();
    expect(errors).toEqual([]);
    // No address, and no provider message, in any line the lane writes.
    expect(logged).not.toContain("@");
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    const { pool: appPool } = await import("@/db");
    await appPool.end();
  });

  describe("claims", () => {
    it("takes at most 100 rows of the oldest campaign under a new key, committed before the request", async () => {
      const older = await createCampaign();
      const newer = await createCampaign();
      const first = await queueEmails(older, 120);
      const second = await queueEmails(newer, 3);
      fixture.revisions.set(older, 3);
      fixture.revisions.set(newer, 1);

      const seenAtRequest: { key: string; rows: Delivery[] }[] = [];
      answerWith(async (payload, options) => {
        // Read from another connection: only committed rows are visible.
        const rows = await integrationDb!
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.batchKey, options.idempotencyKey))
          .orderBy(asc(notificationDeliveries.id));
        seenAtRequest.push({ key: options.idempotencyKey, rows });
        return accepted(payload);
      });

      const run = await runLane();

      expect(run).toMatchObject({
        batches: 3,
        requests: 3,
        sent: 123,
        failed: 0,
        retry: 0,
        stopped: "idle",
      });
      const byKey = (index: number) => seenAtRequest[index]!.rows;
      expect(batchCalls.map((call) => call.to.length)).toEqual([100, 20, 3]);
      expect(batchCalls.every((call) => call.validation === "permissive")).toBe(
        true,
      );
      expect(batchCalls[0]!.key).toMatch(keyPattern(older));
      expect(batchCalls[1]!.key).toMatch(keyPattern(older));
      expect(batchCalls[2]!.key).toMatch(keyPattern(newer));
      expect(new Set(batchCalls.map((call) => call.key)).size).toBe(3);

      // The key was on exactly those rows, processing, when the request left.
      expect(byKey(0).map((row) => row.id)).toEqual(
        first.slice(0, 100).map((row) => row.id),
      );
      expect(byKey(1).map((row) => row.id)).toEqual(
        first.slice(100).map((row) => row.id),
      );
      expect(byKey(2).map((row) => row.id)).toEqual(
        second.map((row) => row.id),
      );
      for (const { rows } of seenAtRequest) {
        expect(rows.every((row) => row.status === "processing")).toBe(true);
        expect(
          rows.every((row) => row.leaseOwner?.startsWith("bulk-email:")),
        ).toBe(true);
      }
      // One email per row, to the row's address, in id order.
      expect(batchCalls[2]!.to).toEqual(
        second.map((row) => row.recipientEmail),
      );

      const after = await rowsOf([...first, ...second]);
      expect(after.every((row) => row.status === "sent")).toBe(true);
      expect(
        after.every((row) => row.providerMessageId?.startsWith("re_")),
      ).toBe(true);
      expect(new Set(after.map((row) => row.providerMessageId)).size).toBe(123);
      expect(after.map((row) => row.contentRevision)).toEqual([
        ...Array(120).fill(3),
        1,
        1,
        1,
      ]);
      expect(
        after.every(
          (row) =>
            row.leaseOwner === null &&
            row.batchKey !== null &&
            row.maybeSentAt === null &&
            row.lastError === null &&
            row.sentAt !== null &&
            row.attempts === 0,
        ),
      ).toBe(true);

      // The renderer ran inside the transaction holding both locks.
      expect(fixture.prepares).toHaveLength(3);
      expect(
        fixture.prepares.every(
          (call) => call.heldContentLock && call.heldLaneLock,
        ),
      ).toBe(true);
    });

    it("re-claims a held batch first, whole and under its own key, and never adds rows to it", async () => {
      const campaign = await createCampaign();
      const fresh = await queueEmails(campaign, 4);
      const key = `${TEMPLATE}-batch:${campaign}:${randomUUID()}`;
      const held = await queueEmails(campaign, 3, { batchKey: key });
      const settled = await queueEmails(campaign, 2, {
        batchKey: key,
        status: "sent",
        sentAt: new Date(),
      });

      const run = await runLane();

      expect(run).toMatchObject({ batches: 2, requests: 2, sent: 7 });
      expect(batchCalls[0]!.key).toBe(key);
      expect(batchCalls[0]!.to).toEqual(held.map((row) => row.recipientEmail));
      expect(batchCalls[1]!.key).not.toBe(key);
      expect(batchCalls[1]!.key).toMatch(keyPattern(campaign));
      expect(batchCalls[1]!.to).toEqual(fresh.map((row) => row.recipientEmail));

      const { rows } = await pool!.query(
        "SELECT id FROM notification_deliveries WHERE batch_key = $1 ORDER BY id",
        [key],
      );
      expect(rows.map((row) => row.id)).toEqual(
        [...held, ...settled].map((row) => row.id),
      );
    });

    it("marks a crashed attempt maybe_sent_at when its lease brings it back, and leaves a live lease alone", async () => {
      const campaign = await createCampaign();
      const key = `${TEMPLATE}-batch:${campaign}:${randomUUID()}`;
      const crashed = await queueEmails(campaign, 2, {
        batchKey: key,
        status: "processing",
        leaseOwner: "bulk-email:crashed",
        leaseExpiresAt: sql`now() - interval '1 minute'`,
      });
      const liveKey = `${TEMPLATE}-batch:${campaign}:${randomUUID()}`;
      const live = await queueEmails(campaign, 1, {
        batchKey: liveKey,
        status: "processing",
        leaseOwner: "bulk-email:live",
        leaseExpiresAt: sql`now() + interval '4 minutes'`,
      });

      let atRequest: Delivery[] = [];
      answerWith(async (payload) => {
        atRequest = await rowsOf(crashed);
        return accepted(payload);
      });

      const run = await runLane();

      expect(run).toMatchObject({ batches: 1, requests: 1, sent: 2 });
      expect(batchCalls.map((call) => call.key)).toEqual([key]);
      expect(atRequest.every((row) => row.maybeSentAt !== null)).toBe(true);
      expect(
        atRequest.every((row) => row.leaseOwner !== "bulk-email:crashed"),
      ).toBe(true);
      const after = await rowsOf(crashed);
      expect(after.every((row) => row.status === "sent")).toBe(true);
      // Kept as history: the report reads it with the status.
      expect(after.every((row) => row.maybeSentAt !== null)).toBe(true);
      expect(await rowsOf(live)).toEqual(live);
    });

    it("takes only its own campaign when scoped, and only the renderer's scope lane-wide", async () => {
      const other = await createCampaign();
      const mine = await createCampaign();
      const outside = await createCampaign({ inScope: false });
      const otherRows = await queueEmails(other, 2);
      const mineRows = await queueEmails(mine, 2);
      const outsideRows = await queueEmails(outside, 2);
      const otherTemplate = await queueEmails(mine, 1, {
        templateKey: "no_renderer",
      });

      expect(await runLane({ campaignId: mine })).toMatchObject({ sent: 2 });
      expect((await rowsOf(mineRows)).map((row) => row.status)).toEqual([
        "sent",
        "sent",
      ]);
      expect(await rowsOf(otherRows)).toEqual(otherRows);

      expect(await runLane()).toMatchObject({ sent: 2, stopped: "idle" });
      expect((await rowsOf(otherRows)).map((row) => row.status)).toEqual([
        "sent",
        "sent",
      ]);
      expect(await rowsOf(outsideRows)).toEqual(outsideRows);
      expect(await rowsOf(otherTemplate)).toEqual(otherTemplate);
    });
  });

  describe("outcomes", () => {
    it("keeps the key and spends an attempt on an unknown outcome; a 409 then records idempotent_replay", async () => {
      const campaign = await createCampaign();
      const queued = await queueEmails(campaign, 2);
      answerWith(
        () => refusal("application_error", 500),
        () => refusal("invalid_idempotent_request", 409),
      );

      const first = await runLane();
      const dbNow = await databaseNow();
      expect(first).toMatchObject({ requests: 1, retry: 2, stopped: "idle" });
      const unknown = await rowsOf(queued);
      const key = batchCalls[0]!.key;
      for (const row of unknown) {
        expect(row).toMatchObject({
          status: "pending",
          attempts: 1,
          batchKey: key,
          lastError: "resend:application_error",
          leaseOwner: null,
        });
        expect(row.maybeSentAt).not.toBeNull();
        expectSecondsAfter(row.nextAttemptAt, dbNow, 30);
      }

      // Not due yet: the backoff holds it.
      expect(await runLane()).toMatchObject({ batches: 0, stopped: "idle" });
      await makeDue(queued);
      const second = await runLane();

      expect(second).toMatchObject({ requests: 1, sent: 2 });
      expect(batchCalls.map((call) => call.key)).toEqual([key, key]);
      for (const row of await rowsOf(queued)) {
        expect(row).toMatchObject({
          status: "sent",
          lastError: "idempotent_replay",
          contentRevision: null,
          providerMessageId: null,
          batchKey: key,
          attempts: 1,
        });
        expect(row.sentAt).not.toBeNull();
      }
    });

    it("records the revision it rendered when a 200 follows a timeout", async () => {
      const campaign = await createCampaign();
      const queued = await queueEmails(campaign, 2);
      fixture.revisions.set(campaign, 1);
      const ids = ["re_first", "re_second"];
      answerWith(
        () => Promise.reject(new Error("Resend request timed out")),
        () => ({
          data: { data: ids.map((id) => ({ id })), errors: [] },
          error: null,
          headers: {},
        }),
      );

      await runLane();
      const timedOut = await rowsOf(queued);
      expect(
        timedOut.map(({ status, attempts, lastError }) => ({
          status,
          attempts,
          lastError,
        })),
      ).toEqual([
        { status: "pending", attempts: 1, lastError: "timeout" },
        { status: "pending", attempts: 1, lastError: "timeout" },
      ]);
      expect(timedOut.every((row) => row.maybeSentAt !== null)).toBe(true);

      // An edit landed in between: the retry renders the current revision.
      fixture.revisions.set(campaign, 2);
      await makeDue(queued);
      await runLane();

      expect(batchCalls[1]!.key).toBe(batchCalls[0]!.key);
      const sent = await rowsOf(queued);
      expect(
        sent.map(
          ({ status, providerMessageId, contentRevision, lastError }) => ({
            status,
            providerMessageId,
            contentRevision,
            lastError,
          }),
        ),
      ).toEqual([
        {
          status: "sent",
          providerMessageId: "re_first",
          contentRevision: 2,
          lastError: null,
        },
        {
          status: "sent",
          providerMessageId: "re_second",
          contentRevision: 2,
          lastError: null,
        },
      ]);
    });

    it("drops the key on a refusal nothing reached, and keeps it on one that may have landed", async () => {
      const fresh = await createCampaign();
      const maybe = await createCampaign();
      const freshRows = await queueEmails(fresh, 2);
      const key = `${TEMPLATE}-batch:${maybe}:${randomUUID()}`;
      const maybeRows = await queueEmails(maybe, 2, {
        batchKey: key,
        maybeSentAt: sql`now() - interval '10 minutes'`,
        attempts: 1,
      });
      answerWith(() => refusal("validation_error", 422));

      const run = await runLane();
      const dbNow = await databaseNow();

      expect(run).toMatchObject({ requests: 2, retry: 4, stopped: "idle" });
      for (const row of await rowsOf(freshRows)) {
        expect(row).toMatchObject({
          status: "pending",
          batchKey: null,
          maybeSentAt: null,
          attempts: 1,
          lastError: "resend:validation_error",
        });
        expectSecondsAfter(row.nextAttemptAt, dbNow, 30);
      }
      for (const row of await rowsOf(maybeRows)) {
        expect(row).toMatchObject({
          status: "pending",
          batchKey: key,
          attempts: 2,
          lastError: "resend:validation_error",
        });
        expect(row.maybeSentAt).not.toBeNull();
        expectSecondsAfter(row.nextAttemptAt, dbNow, 60);
      }
    });

    it("fails the batch and the campaign's never-batched emails on a quota error, and stops the step", async () => {
      const campaign = await createCampaign();
      const other = await createCampaign();
      const key = `${TEMPLATE}-batch:${campaign}:${randomUUID()}`;
      const batch = await queueEmails(campaign, 2, { batchKey: key });
      const waiting = await queueEmails(campaign, 2);
      const notDue = await queueEmails(campaign, 1, {
        nextAttemptAt: sql`now() + interval '10 minutes'`,
      });
      const maybeKey = `${TEMPLATE}-batch:${campaign}:${randomUUID()}`;
      const maybeHeld = await queueEmails(campaign, 1, {
        batchKey: maybeKey,
        maybeSentAt: sql`now() - interval '1 minute'`,
        nextAttemptAt: sql`now() + interval '10 minutes'`,
      });
      const otherRows = await queueEmails(other, 2);
      answerWith(() => refusal("monthly_quota_exceeded", 429));

      const run = await runLane();

      expect(run).toMatchObject({ requests: 1, failed: 5, stopped: "quota" });
      expect(batchCalls.map((call) => call.key)).toEqual([key]);
      for (const row of await rowsOf([...batch, ...waiting, ...notDue])) {
        expect(row).toMatchObject({
          status: "failed",
          lastError: "resend:monthly_quota_exceeded",
          batchKey: null,
          attempts: 0,
        });
      }
      // A held batch that may have landed is left to its own attempt.
      expect(await rowsOf(maybeHeld)).toEqual(maybeHeld);
      expect(await rowsOf(otherRows)).toEqual(otherRows);
      expect(takeErrors()).toEqual([
        expect.stringContaining("[comunicados] Resend quota exceeded"),
      ]);

      // That held batch, once due, waits an hour instead of failing.
      await makeDue(maybeHeld);
      expect(await runLane({ campaignId: campaign })).toMatchObject({
        stopped: "quota",
      });
      const dbNow = await databaseNow();
      const [held] = await rowsOf(maybeHeld);
      expect(held).toMatchObject({
        status: "pending",
        batchKey: maybeKey,
        attempts: 0,
        lastError: "resend:monthly_quota_exceeded",
      });
      expectSecondsAfter(held!.nextAttemptAt, dbNow, 3600);
      takeErrors();
    });

    it("holds a configuration refusal 15 minutes without spending, logs only the code and stops", async () => {
      const campaign = await createCampaign();
      const other = await createCampaign();
      const queued = await queueEmails(campaign, 2);
      const otherRows = await queueEmails(other, 2);
      answerWith(() => refusal("invalid_api_key", 403));

      const run = await runLane();
      const dbNow = await databaseNow();

      expect(run).toMatchObject({ requests: 1, retry: 2, stopped: "config" });
      for (const row of await rowsOf(queued)) {
        expect(row).toMatchObject({
          status: "pending",
          attempts: 0,
          batchKey: null,
          maybeSentAt: null,
          lastError: "resend:invalid_api_key",
        });
        expectSecondsAfter(row.nextAttemptAt, dbNow, 15 * 60);
      }
      expect(await rowsOf(otherRows)).toEqual(otherRows);
      expect(consoleError.mock.calls).toEqual([
        [
          "[comunicados] Resend refused the configuration",
          { code: "resend:invalid_api_key" },
        ],
      ]);
      takeErrors();
    });

    it("spends nothing on a throttle, drops the key, waits Retry-After, and stops after three", async () => {
      const campaigns = [
        await createCampaign(),
        await createCampaign(),
        await createCampaign(),
        await createCampaign(),
      ];
      const queued = [];
      for (const campaign of campaigns) {
        queued.push(await queueEmails(campaign, 1));
      }
      answerWith(() =>
        refusal("rate_limit_exceeded", 429, { "retry-after": "3" }),
      );

      const run = await runLane();
      const dbNow = await databaseNow();

      expect(run).toMatchObject({
        requests: 3,
        throttles: 3,
        retry: 3,
        stopped: "throttled",
      });
      for (const row of await rowsOf(queued.slice(0, 3).flat())) {
        expect(row).toMatchObject({
          status: "pending",
          attempts: 0,
          batchKey: null,
          lastError: "resend:rate_limit_exceeded",
        });
        expectSecondsAfter(row.nextAttemptAt, dbNow, 3, 2);
      }
      expect(await rowsOf(queued[3]!)).toEqual(queued[3]);
    });

    it("fails only the row a permissive batch refused, clearing its maybe_sent_at", async () => {
      const campaign = await createCampaign();
      const key = `${TEMPLATE}-batch:${campaign}:${randomUUID()}`;
      const queued = await queueEmails(campaign, 3, {
        batchKey: key,
        maybeSentAt: sql`now() - interval '5 minutes'`,
        attempts: 1,
      });
      answerWith(() => ({
        data: {
          data: [{ id: "re_zero" }, { id: "re_two" }],
          errors: [
            { index: 1, message: `${queued[1]!.recipientEmail} is invalid` },
          ],
        },
        error: null,
        headers: {},
      }));

      const run = await runLane();

      expect(run).toMatchObject({ sent: 2, failed: 1 });
      const [zero, one, two] = await rowsOf(queued);
      expect(zero).toMatchObject({
        status: "sent",
        providerMessageId: "re_zero",
      });
      expect(two).toMatchObject({
        status: "sent",
        providerMessageId: "re_two",
      });
      expect(one).toMatchObject({
        status: "failed",
        lastError: "resend:item_rejected",
        maybeSentAt: null,
        providerMessageId: null,
        batchKey: key,
      });
    });

    it("sends every row that is not an error with no id when the answer does not add up", async () => {
      const campaign = await createCampaign();
      const queued = await queueEmails(campaign, 3);
      answerWith(() => ({
        data: { data: [{ id: "re_only" }], errors: [] },
        error: null,
        headers: {},
      }));

      expect(await runLane()).toMatchObject({ sent: 3 });
      for (const row of await rowsOf(queued)) {
        expect(row).toMatchObject({
          status: "sent",
          providerMessageId: null,
          contentRevision: 1,
        });
      }
      expect(takeErrors()).toEqual([
        expect.stringContaining("[comunicados] batch id mismatch"),
      ]);
    });

    it("records development's simulated batch as sent, with its revision and no id", async () => {
      const campaign = await createCampaign();
      const queued = await queueEmails(campaign, 2);
      fixture.revisions.set(campaign, 5);
      answerWith((payload) => ({
        data: { data: payload.map(() => ({ id: "not-sent" })), errors: [] },
        error: null,
        headers: null,
        simulated: true,
      }));

      await runLane();
      for (const row of await rowsOf(queued)) {
        expect(row).toMatchObject({
          status: "sent",
          lastError: "simulated",
          contentRevision: 5,
          providerMessageId: null,
        });
      }
    });

    it("settles the renderer's skips and failures with the batch, and sends nothing when nothing is left", async () => {
      const campaign = await createCampaign();
      const [unsubscribed] = await queueEmails(campaign, 1, {
        payload: { skip: "unsubscribed" },
      });
      const [changed] = await queueEmails(campaign, 1, {
        payload: { fail: "address_changed" },
      });
      const [invalid] = await queueEmails(campaign, 1, {
        recipientEmail: "not-an-address",
      });
      const [good] = await queueEmails(campaign, 1);
      const skipsOnly = await createCampaign();
      const skipRows = await queueEmails(skipsOnly, 2, {
        payload: { skip: "suppressed" },
      });

      const run = await runLane();

      expect(run).toMatchObject({ batches: 2, requests: 1, sent: 1 });
      expect(batchCalls).toHaveLength(1);
      expect(batchCalls[0]!.to).toEqual([good!.recipientEmail]);
      const settled = await rowsOf([unsubscribed!, changed!, invalid!, good!]);
      expect(
        settled.map(({ status, lastError, batchKey }) => ({
          status,
          lastError,
          kept: batchKey === batchCalls[0]!.key,
        })),
      ).toEqual([
        { status: "skipped", lastError: "unsubscribed", kept: true },
        { status: "failed", lastError: "address_changed", kept: true },
        { status: "skipped", lastError: "invalid_address", kept: true },
        { status: "sent", lastError: null, kept: true },
      ]);
      for (const row of await rowsOf(skipRows)) {
        expect(row).toMatchObject({
          status: "skipped",
          lastError: "suppressed",
          leaseOwner: null,
        });
      }
    });
  });

  describe("expiry", () => {
    it("never sends a row written more than 20 hours ago, and marks an unsettled one as possibly sent", async () => {
      const campaign = await createCampaign();
      const old = { createdAt: sql`now() - interval '21 hours'` };
      const [neverTried] = await queueEmails(campaign, 1, old);
      const [maybeSent] = await queueEmails(campaign, 1, {
        ...old,
        batchKey: `${TEMPLATE}-batch:${campaign}:${randomUUID()}`,
        maybeSentAt: sql`now() - interval '19 hours'`,
      });
      const [unsettled] = await queueEmails(campaign, 1, {
        ...old,
        batchKey: `${TEMPLATE}-batch:${campaign}:${randomUUID()}`,
        status: "processing",
        leaseOwner: "bulk-email:crashed",
        leaseExpiresAt: sql`now() - interval '1 hour'`,
      });
      const [leased] = await queueEmails(campaign, 1, {
        ...old,
        batchKey: `${TEMPLATE}-batch:${campaign}:${randomUUID()}`,
        status: "processing",
        leaseOwner: "bulk-email:live",
        leaseExpiresAt: sql`now() + interval '4 minutes'`,
      });
      const [recent] = await queueEmails(campaign, 1, {
        createdAt: sql`now() - interval '19 hours'`,
      });

      const run = await runLane();

      expect(run).toMatchObject({ expired: 3, requests: 1, sent: 1 });
      expect(batchCalls[0]!.to).toEqual([recent!.recipientEmail]);
      const [a, b, c, d, e] = await rowsOf([
        neverTried!,
        maybeSent!,
        unsettled!,
        leased!,
        recent!,
      ]);
      expect(a).toMatchObject({
        status: "failed",
        lastError: "expired",
        maybeSentAt: null,
      });
      expect(b).toMatchObject({
        status: "failed",
        lastError: "outcome_unknown",
      });
      expect(b!.maybeSentAt).toEqual(maybeSent!.maybeSentAt);
      expect(c).toMatchObject({
        status: "failed",
        lastError: "outcome_unknown",
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      // So "Reintentar fallidos", which skips maybe-sent rows, leaves it.
      expect(c!.maybeSentAt).not.toBeNull();
      expect(d).toEqual(leased);
      expect(e).toMatchObject({ status: "sent" });
    });
  });

  describe("failures before and after the request", () => {
    it("spends attempts with backoff when the renderer throws, and does not hold up the next campaign", async () => {
      const broken = await createCampaign();
      const working = await createCampaign();
      const brokenRows = await queueEmails(broken, 2);
      const workingRows = await queueEmails(working, 2);
      fixture.throwFor.add(broken);

      const run = await runLane();
      const dbNow = await databaseNow();

      expect(run).toMatchObject({ batches: 2, requests: 1, sent: 2, retry: 2 });
      expect(batchCalls).toHaveLength(1);
      for (const row of await rowsOf(brokenRows)) {
        expect(row).toMatchObject({
          status: "pending",
          attempts: 1,
          batchKey: null,
          maybeSentAt: null,
          lastError: "render_failed",
          leaseOwner: null,
        });
        expectSecondsAfter(row.nextAttemptAt, dbNow, 30);
      }
      expect(
        (await rowsOf(workingRows)).every((row) => row.status === "sent"),
      ).toBe(true);
      const errors = takeErrors();
      expect(errors).toEqual([
        expect.stringContaining("[comunicados] batch could not be rendered"),
      ]);
      expect(errors[0]).not.toContain("@");

      // At the fifth attempt it fails, as possibly sent when it may have.
      const key = `${TEMPLATE}-batch:${broken}:${randomUUID()}`;
      await setRows(brokenRows.slice(1), {
        batchKey: key,
        maybeSentAt: sql`now() - interval '1 hour'`,
      });
      await setRows(brokenRows, { attempts: 4 });
      await makeDue(brokenRows.slice(0, 1));
      await makeDue(brokenRows.slice(1));
      await runLane();
      const [neverSent, maybeSent] = await rowsOf(brokenRows);
      expect(neverSent).toMatchObject({
        status: "failed",
        attempts: 5,
        lastError: "render_failed",
        batchKey: null,
      });
      expect(maybeSent).toMatchObject({
        status: "failed",
        attempts: 5,
        lastError: "outcome_unknown",
        batchKey: key,
      });
      expect(takeErrors()).toHaveLength(2);
    });

    it("hands a claim back untouched when a database error comes before the request, retrying once", async () => {
      const campaign = await createCampaign();
      const queued = await queueEmails(campaign, 2);
      fixture.transientFor.add(campaign);

      const run = await runLane();

      expect(run).toMatchObject({
        batches: 2,
        requests: 0,
        stopped: "transient",
      });
      expect(sendBatchMock).not.toHaveBeenCalled();
      const after = await rowsOf(queued);
      for (const row of after) {
        expect(row).toMatchObject({
          status: "pending",
          attempts: 0,
          maybeSentAt: null,
          leaseOwner: null,
          lastError: null,
        });
        expect(row.batchKey).toMatch(keyPattern(campaign));
      }
      // The retry was the same batch, under the same key.
      expect(new Set(after.map((row) => row.batchKey)).size).toBe(1);
      expect(fixture.prepares.map((call) => call.ids)).toEqual([
        queued.map((row) => row.id),
        queued.map((row) => row.id),
      ]);
    });

    it("leaves the rows processing when the settle fails after the request, and the lease brings them back under the same key", async () => {
      const campaign = await createCampaign();
      const queued = await queueEmails(campaign, 2);
      fixture.statementTimeoutMs = 300;
      let unblock: (() => Promise<void>) | null = null;
      answerWith(async (payload) => {
        // Holds one row so the settle runs into its statement timeout.
        unblock = await holdTransaction(
          "SELECT 1 FROM notification_deliveries WHERE id = $1 FOR UPDATE",
          [queued[0]!.id],
        );
        return accepted(payload);
      }, accepted);

      let run: BulkEmailRun;
      try {
        run = await runLane();
      } finally {
        await (unblock as (() => Promise<void>) | null)?.();
      }

      expect(run).toMatchObject({ requests: 1, sent: 0, stopped: "error" });
      const key = batchCalls[0]!.key;
      const stuck = await rowsOf(queued);
      for (const row of stuck) {
        expect(row).toMatchObject({
          status: "processing",
          batchKey: key,
          attempts: 0,
          maybeSentAt: null,
        });
        expect(row.leaseOwner).toMatch(/^bulk-email:/);
      }
      expect(takeErrors()).toEqual([
        expect.stringContaining(
          "[comunicados] batch not settled after its request",
        ),
      ]);

      // Not before its lease runs out.
      fixture.statementTimeoutMs = null;
      expect(await runLane()).toMatchObject({ batches: 0 });
      await setRows(queued, {
        leaseExpiresAt: sql`now() - interval '1 second'`,
      });
      let atRequest: Delivery[] = [];
      answerWith(async (payload) => {
        atRequest = await rowsOf(queued);
        return accepted(payload);
      });
      expect(await runLane()).toMatchObject({ sent: 2 });
      expect(batchCalls.at(-1)!.key).toBe(key);
      expect(atRequest.every((row) => row.maybeSentAt !== null)).toBe(true);
    });
  });

  describe("the lane lock, the reserve and the content lock", () => {
    it("lets two drivers make one request at a time, spacing apart, without ever waiting on the lane lock", async () => {
      const first = await createCampaign();
      const second = await createCampaign();
      const queued = [
        ...(await queueEmails(first, 120)),
        ...(await queueEmails(second, 120)),
      ];
      const spacingMs = 150;
      answerWith(async (payload) => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return accepted(payload);
      });

      let sampling = true;
      let waiters = 0;
      const sampler = (async () => {
        while (sampling) {
          const { rows } = await pool!.query(
            `SELECT count(*)::int AS n FROM pg_locks
             WHERE locktype = 'advisory' AND NOT granted AND classid = $1 AND objsubid = 2`,
            [bulk.BULK_LANE_LOCK_NAMESPACE],
          );
          waiters = Math.max(waiters, rows[0].n);
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      })();

      const runs = await Promise.all([
        runLane({ timing: { spacingMs } }),
        runLane({ timing: { spacingMs } }),
      ]);
      sampling = false;
      await sampler;

      expect(runs[0]!.sent + runs[1]!.sent).toBe(240);
      expect(runs[0]!.requests + runs[1]!.requests).toBe(4);
      // Both were in the lane at once, and the second one stepped aside.
      expect(runs.every((run) => run.requests > 0)).toBe(true);
      expect(runs[0]!.busy + runs[1]!.busy).toBeGreaterThan(0);
      expect(waiters).toBe(0);

      const calls = [...batchCalls].sort((a, b) => a.startedAt - b.startedAt);
      expect(calls).toHaveLength(4);
      for (let index = 1; index < calls.length; index += 1) {
        // Timers can fire a millisecond early.
        expect(
          calls[index]!.startedAt - calls[index - 1]!.endedAt,
        ).toBeGreaterThanOrEqual(spacingMs - 2);
      }
      expect(new Set(calls.map((call) => call.key)).size).toBe(4);
      expect((await rowsOf(queued)).every((row) => row.status === "sent")).toBe(
        true,
      );
    });

    it("hands a claim back untouched when less than the reserve is left", async () => {
      const campaign = await createCampaign();
      const queued = await queueEmails(campaign, 2);

      const run = await runLane({ deadline: Date.now() + 10_000 });

      expect(run).toMatchObject({
        batches: 1,
        requests: 0,
        released: 2,
        stopped: "reserve",
      });
      expect(sendBatchMock).not.toHaveBeenCalled();
      expect(fixture.prepares).toEqual([]);
      const dbNow = await databaseNow();
      const released = await rowsOf(queued);
      for (const row of released) {
        expect(row).toMatchObject({
          status: "pending",
          attempts: 0,
          maybeSentAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
        });
        expect(row.batchKey).toMatch(keyPattern(campaign));
        expectSecondsAfter(row.nextAttemptAt, dbNow, 0);
      }

      // The next run sends them under the key the claim minted.
      await runLane();
      expect(batchCalls.map((call) => call.key)).toEqual([
        released[0]!.batchKey,
      ]);
    });

    it("hands the claim back with nothing marked when the content lock does not come in time", async () => {
      const campaign = await createCampaign();
      const queued = await queueEmails(campaign, 2);
      // One of the two was retracted while the claim waited.
      await integrationDb!
        .update(notifications)
        .set({ archivedAt: sql`now()`, retractedAt: sql`now()` })
        .where(eq(notifications.id, queued[1]!.notificationId!));
      const unlock = await holdTransaction(
        "SELECT pg_advisory_xact_lock($1, $2)",
        [FIXTURE_LOCK_NAMESPACE, campaign],
      );

      let run: BulkEmailRun;
      try {
        run = await runLane({ timing: { maxLockTimeoutMs: 150 } });
      } finally {
        await unlock();
      }

      expect(run).toMatchObject({
        batches: 1,
        requests: 0,
        released: 1,
        skipped: 1,
        stopped: "lock_timeout",
      });
      expect(sendBatchMock).not.toHaveBeenCalled();
      expect(fixture.prepares).toEqual([]);
      const [waiting, retracted] = await rowsOf(queued);
      expect(waiting).toMatchObject({
        status: "pending",
        attempts: 0,
        maybeSentAt: null,
        leaseOwner: null,
        lastError: null,
      });
      expect(waiting!.batchKey).toMatch(keyPattern(campaign));
      expect(retracted).toMatchObject({
        status: "skipped",
        lastError: "retracted",
        attempts: 0,
        maybeSentAt: null,
      });
    });
  });
});
