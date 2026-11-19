// @vitest-environment node

import { asc, eq, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import {
  disciplinaryNotificationJobs,
  emailSuppressions,
  emailUnsubscribes,
  notificationDeliveries,
  pendingUserDeletions,
  programSessions,
  reservationNotificationJobs,
  sessionOccurrences,
  sessionPurchaseLines,
  sessionPurchases,
  sessionTickets,
  userEmailChanges,
  users,
} from "@/db/schema";

/**
 * The database half of "Cambiar correo" against a real database: what it
 * refuses, and that the profile, the mail already queued for the person and
 * their opt-outs all follow to the new address, and nothing else does.
 */

vi.mock("server-only", () => ({}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
    return /(^|[_-])(test|ci)([_-]|$)/i.test(databaseName);
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
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type EmailChanges = typeof import("@/app/lib/users/email-changes");
type AppDb = typeof import("@/db");
let emailChanges: EmailChanges;
let app: AppDb;

/**
 * Every address, Clerk id and key a test makes carries this, for cleanup.
 * Its own for each run of the file, so two runs on one database do not delete
 * each other's rows. Lowercase, with nothing LIKE reads as a wildcard.
 */
const MARK = `mailchg-it-${Math.random().toString(36).slice(2, 10)}`;
const PATTERN = `%${MARK}%`;
const created = { users: [] as number[] };

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function address(label: string) {
  return `${label}-${MARK}-${suffix()}@example.test`;
}

function key(label: string) {
  return `${label}-${MARK}-${suffix()}`;
}

async function makeUser(
  label: string,
  values: Partial<typeof users.$inferInsert> = {},
) {
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: key(`clerk-${label}`),
      email: address(label),
      displayName: `Persona ${label}`,
      ...values,
    })
    .returning();
  created.users.push(user.id);
  return user;
}

function begin(userId: number, newEmail: string, actorId: number) {
  return app.db.transaction((tx) =>
    emailChanges.beginEmailChange(tx, { userId, newEmail, actorId }),
  );
}

/** Starts a change and returns what `complete` needs to finish it. */
async function begun(label = "ana") {
  const admin = await makeUser("admin", { role: "admin" });
  const user = await makeUser(label);
  const newEmail = address(`${label}-nueva`).toLowerCase();
  const result = await begin(user.id, newEmail, admin.id);
  if (result.status !== "ok") {
    throw new Error(`expected the change to start, got ${result.status}`);
  }
  return { admin, user, newEmail, changeId: result.changeId };
}

function complete(input: {
  changeId: number;
  user: { id: number; email: string };
  newEmail: string;
  unlinkedProviders?: string[];
}) {
  return app.db.transaction((tx) =>
    emailChanges.completeEmailChange(tx, {
      changeId: input.changeId,
      userId: input.user.id,
      oldEmail: input.user.email,
      newEmail: input.newEmail,
      unlinkedProviders: input.unlinkedProviders ?? [],
    }),
  );
}

async function auditRow(changeId: number) {
  const [row] = await integrationDb!
    .select()
    .from(userEmailChanges)
    .where(eq(userEmailChanges.id, changeId));
  return row;
}

async function emailOf(userId: number) {
  const [row] = await integrationDb!
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return row?.email;
}

async function auditRowsFor(userId: number) {
  return integrationDb!
    .select()
    .from(userEmailChanges)
    .where(eq(userEmailChanges.userId, userId))
    .orderBy(asc(userEmailChanges.id));
}

async function makeOccurrence() {
  const db = integrationDb!;
  const [session] = await db
    .insert(programSessions)
    .values({ slug: key("charla"), title: "Charla", type: "talk" })
    .returning({ id: programSessions.id });
  const [occurrence] = await db
    .insert(sessionOccurrences)
    .values({
      sessionId: session.id,
      startsAt: new Date("2031-05-01T15:00:00Z"),
      endsAt: new Date("2031-05-01T16:00:00Z"),
    })
    .returning({ id: sessionOccurrences.id });
  return { sessionId: session.id, occurrenceId: occurrence.id };
}

async function makeTicket(
  input: {
    occurrence: { sessionId: number; occurrenceId: number };
    userId: number | null;
    email: string;
    status?: "valid" | "cancelled";
  },
  // A rival's own connection, for a checkout that has not committed.
  db: Pick<NonNullable<typeof integrationDb>, "insert"> = integrationDb!,
) {
  const now = new Date();
  const [purchase] = await db
    .insert(sessionPurchases)
    .values({
      ...(input.userId
        ? { userId: input.userId }
        : {
            guestName: "Invitada",
            guestEmail: input.email,
            guestPhone: "70000000",
          }),
      accessTokenHash: key("token"),
      paymentMode: "free",
      buyerEligibility: "public",
      eligibilityEvaluatedAt: now,
      eligibilitySnapshot: {},
      subtotalAmount: 0,
      totalAmount: 0,
      noRefundPolicyVersion: "v1",
      noRefundPolicyAcceptedAt: now,
      idempotencyKey: key("purchase"),
    })
    .returning({ id: sessionPurchases.id });
  const [line] = await db
    .insert(sessionPurchaseLines)
    .values({
      purchaseId: purchase.id,
      occurrenceId: input.occurrence.occurrenceId,
      sessionId: input.occurrence.sessionId,
      unitPrice: 0,
      basePrice: 0,
      existingPrice: 0,
      discountAmount: 0,
      priceBasis: "public",
      pricingSnapshot: {},
      sessionTitleSnapshot: "Charla",
      occurrenceStartsAtSnapshot: new Date("2031-05-01T15:00:00Z"),
    })
    .returning({ id: sessionPurchaseLines.id });
  const [ticket] = await db
    .insert(sessionTickets)
    .values({
      purchaseLineId: line.id,
      occurrenceId: input.occurrence.occurrenceId,
      code: key("qr"),
      status: input.status ?? "valid",
      cancelledAt: input.status === "cancelled" ? now : null,
      attendeeUserId: input.userId,
      attendeeName: "Asistente",
      attendeeEmail: input.email,
    })
    .returning({ id: sessionTickets.id });
  return ticket.id;
}

/** As if the change had started `interval` ago, by the database's clock. */
function ageChange(changeId: number, interval: string) {
  return integrationDb!
    .update(userEmailChanges)
    .set({ createdAt: sql`clock_timestamp() - ${interval}::interval` })
    .where(eq(userEmailChanges.id, changeId));
}

/**
 * A second connection with a transaction open, to hold a lock or a row that
 * has not committed. `release` rolls back whatever `commit` did not.
 */
async function openRival() {
  const client = await pool!.connect();
  let rows: { pid: number }[];
  try {
    ({ rows } = await client.query<{ pid: number }>(
      "select pg_backend_pid() as pid",
    ));
    await client.query("begin");
  } catch (error) {
    // Nobody else holds the client yet to give it back.
    client.release();
    throw error;
  }
  let open = true;
  return {
    client,
    db: drizzle(client, { schema }),
    /**
     * Resolves, with the waiter's pid, once PostgreSQL says another session
     * waits on this one.
     */
    async blocksSomeone() {
      const until = Date.now() + 10_000;
      while (Date.now() < until) {
        const waiting = await pool!.query<{ pid: number }>(
          `select pid from pg_stat_activity
           where wait_event_type = 'Lock'
             and $1::int = any(pg_blocking_pids(pid))`,
          [rows[0].pid],
        );
        if (waiting.rowCount) return waiting.rows[0].pid;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(
        "no session was waiting on the rival's lock after 10 s: the statement under test did not reach it",
      );
    },
    async commit() {
      await client.query("commit");
      open = false;
    },
    async release() {
      try {
        if (open) await client.query("rollback");
      } finally {
        client.release();
      }
    },
  };
}

async function ticketEmail(ticketId: number) {
  const [row] = await integrationDb!
    .select({ email: sessionTickets.attendeeEmail })
    .from(sessionTickets)
    .where(eq(sessionTickets.id, ticketId));
  return row.email;
}

describeDatabase("changing the address a person signs in with", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    emailChanges = await import("@/app/lib/users/email-changes");
    app = await import("@/db");

    const result = await pool!.query<{ table: string | null }>(
      "select to_regclass('public.user_email_changes')::text as table",
    );
    if (!result.rows[0]?.table) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  afterEach(async () => {
    const db = integrationDb!;
    await db
      .delete(userEmailChanges)
      .where(like(userEmailChanges.clerkId, PATTERN));
    await db
      .delete(reservationNotificationJobs)
      .where(like(reservationNotificationJobs.deduplicationKey, PATTERN));
    await db
      .delete(disciplinaryNotificationJobs)
      .where(like(disciplinaryNotificationJobs.deduplicationKey, PATTERN));
    await db
      .delete(notificationDeliveries)
      .where(like(notificationDeliveries.idempotencyKey, PATTERN));
    await db
      .delete(emailUnsubscribes)
      .where(like(emailUnsubscribes.emailKey, PATTERN));
    await db
      .delete(emailSuppressions)
      .where(like(emailSuppressions.emailKey, PATTERN));
    await db
      .delete(pendingUserDeletions)
      .where(like(pendingUserDeletions.clerkId, PATTERN));
    // Purchases take their lines and tickets with them, and have to go
    // before the occurrences and the users they hold on to.
    await db
      .delete(sessionPurchases)
      .where(like(sessionPurchases.idempotencyKey, PATTERN));
    await db.delete(programSessions).where(like(programSessions.slug, PATTERN));
    const userIds = created.users.splice(0);
    await db
      .delete(users)
      .where(
        or(
          like(users.clerkId, PATTERN),
          userIds.length > 0 ? inArray(users.id, userIds) : undefined,
        ),
      );
  });

  afterAll(async () => {
    await app?.pool.end();
    await pool?.end();
  });

  describe("beginEmailChange", () => {
    it("records who is moving whom from which address to which", async () => {
      const admin = await makeUser("admin", { role: "admin" });
      const user = await makeUser("Ana.Mixta", {
        displayName: "Ana Ilustra",
        firstName: "Ana",
        lastName: "Rojas",
      });
      const typed = `  ${address("Nueva").toUpperCase()} `;
      const before = Date.now();

      const result = await begin(user.id, typed, admin.id);

      expect(result).toEqual({
        status: "ok",
        resync: false,
        owedNotices: null,
        arrivedFrom: null,
        changeId: expect.any(Number),
        reservedAt: expect.any(Number),
        clerkId: user.clerkId,
        // As stored, not normalized: it is where the old notice goes.
        oldEmail: user.email,
        displayName: "Ana Ilustra",
        firstName: "Ana",
        lastName: "Rojas",
      });
      if (result.status !== "ok") return;
      // Taken before the row: a deadline counted from it ends inside the
      // window, which is counted from the row.
      const row = await auditRow(result.changeId);
      expect(result.reservedAt).toBeGreaterThanOrEqual(before);
      expect(result.reservedAt).toBeLessThanOrEqual(row!.createdAt.getTime());
      expect(row).toMatchObject({
        userId: user.id,
        clerkId: user.clerkId,
        oldEmail: user.email,
        newEmail: typed.trim().toLowerCase(),
        changedByUserId: admin.id,
        unlinkedProviders: [],
        clerkChangedAt: null,
        completedAt: null,
        lastError: null,
        oldNoticeStatus: null,
        newNoticeStatus: null,
      });
      // Nothing about the profile moves until Clerk has.
      expect(await emailOf(user.id)).toBe(user.email);
    });

    it("answers not_found for a profile that does not exist", async () => {
      const admin = await makeUser("admin", { role: "admin" });

      await expect(
        begin(2_000_000_000, address("nueva"), admin.id),
      ).resolves.toEqual({ status: "not_found" });
    });

    it.each([
      ["as stored", (email: string) => email],
      ["in another letter case", (email: string) => email.toLowerCase()],
    ])(
      "takes the address the profile already has, %s, as a resync",
      async (_label, typed) => {
        const admin = await makeUser("admin", { role: "admin" });
        const user = await makeUser("Ana.Mayus");
        expect(user.email).not.toBe(user.email.toLowerCase());

        const result = await begin(user.id, typed(user.email), admin.id);

        expect(result).toMatchObject({
          status: "ok",
          resync: true,
          clerkId: user.clerkId,
          oldEmail: user.email,
        });
        // Audited like any change: old and new are the same address.
        expect(await auditRowsFor(user.id)).toMatchObject([
          {
            oldEmail: user.email,
            newEmail: user.email.toLowerCase(),
            changedByUserId: admin.id,
            completedAt: null,
            lastError: null,
          },
        ]);
      },
    );

    it("resyncs an address that is suppressed: it is already theirs", async () => {
      const admin = await makeUser("admin", { role: "admin" });
      const user = await makeUser("ana");
      await integrationDb!
        .insert(emailSuppressions)
        .values({ emailKey: user.email.toLowerCase(), reason: "bounce" });

      await expect(begin(user.id, user.email, admin.id)).resolves.toMatchObject(
        { status: "ok", resync: true },
      );
    });

    it("does not resync onto an address another profile holds in another case", async () => {
      const admin = await makeUser("admin", { role: "admin" });
      const user = await makeUser("Gemela");
      // The case-sensitive unique constraint lets the lowercase twin exist.
      await makeUser("twin", { email: user.email.toLowerCase() });

      await expect(begin(user.id, user.email, admin.id)).resolves.toEqual({
        status: "email_taken",
      });
    });

    describe("while another change for the same profile is in flight", () => {
      it("refuses, and records nothing more", async () => {
        const { admin, user, newEmail, changeId } = await begun();

        await expect(begin(user.id, newEmail, admin.id)).resolves.toEqual({
          status: "in_progress",
        });
        await expect(
          begin(user.id, address("otra"), admin.id),
        ).resolves.toEqual({ status: "in_progress" });
        expect((await auditRowsFor(user.id)).map((row) => row.id)).toEqual([
          changeId,
        ]);
      });

      it("lets the second of two simultaneous starts wait and then refuses it", async () => {
        const admin = await makeUser("admin", { role: "admin" });
        const user = await makeUser("ana");

        const results = await Promise.all([
          begin(user.id, address("una"), admin.id),
          begin(user.id, address("dos"), admin.id),
        ]);

        expect(results.map((result) => result.status).sort()).toEqual([
          "in_progress",
          "ok",
        ]);
        expect(await auditRowsFor(user.id)).toHaveLength(1);
      });

      it("does not hold back a change for someone else", async () => {
        const { admin } = await begun();
        const other = await makeUser("otra");

        await expect(
          begin(other.id, address("nueva"), admin.id),
        ).resolves.toMatchObject({ status: "ok" });
      });

      it("goes ahead once the earlier one failed", async () => {
        const { admin, user, newEmail, changeId } = await begun();
        await emailChanges.markEmailChangeFailed(
          changeId,
          "clerk_failed: get_user:500",
        );

        await expect(begin(user.id, newEmail, admin.id)).resolves.toMatchObject(
          { status: "ok" },
        );
      });

      it("goes ahead once the earlier one completed", async () => {
        const { admin, user, newEmail, changeId } = await begun();
        await complete({ changeId, user, newEmail });

        // The same address again is now a resync.
        await expect(begin(user.id, newEmail, admin.id)).resolves.toMatchObject(
          { status: "ok", resync: true },
        );
      });

      it("goes ahead once the earlier one is older than any run can be", async () => {
        const { admin, user, newEmail, changeId } = await begun();
        const age = (interval: string) => ageChange(changeId, interval);

        // By the database's clock, on both sides of the two minutes.
        await age("1 minute 50 seconds");
        await expect(begin(user.id, newEmail, admin.id)).resolves.toEqual({
          status: "in_progress",
        });

        await age("2 minutes 5 seconds");
        await expect(begin(user.id, newEmail, admin.id)).resolves.toMatchObject(
          { status: "ok" },
        );
      });

      it("counts the window from when the row is written, not from when it began waiting", async () => {
        const admin = await makeUser("admin", { role: "admin" });
        const user = await makeUser("ana");
        const rival = await openRival();
        let starting: ReturnType<typeof begin>;
        let lockReleasedAt: string;
        try {
          await rival.client.query(
            "select id from users where id = $1 for update",
            [user.id],
          );
          // Its transaction, and with it now(), starts here.
          starting = begin(user.id, address("nueva"), admin.id);
          await rival.blocksSomeone();
          const clock = await pool!.query<{ at: string }>(
            "select clock_timestamp()::timestamp::text as at",
          );
          lockReleasedAt = clock.rows[0].at;
          await rival.commit();
        } finally {
          await rival.release();
        }

        const result = await starting;
        if (result.status !== "ok") throw new Error(result.status);
        const fresh = await pool!.query<{ fresh: boolean }>(
          "select created_at >= $1::timestamp as fresh from user_email_changes where id = $2",
          [lockReleasedAt, result.changeId],
        );
        expect(fresh.rows[0].fresh).toBe(true);
      });

      it("holds a retry back while a run that changed Clerk left its row open, and lets it finish after the window", async () => {
        const { admin, user, newEmail, changeId } = await begun();
        // Clerk changed, then the database went away: nothing completed the
        // row and nothing could note the failure on it.
        await emailChanges.markEmailChangeClerkDone(changeId, ["oauth_google"]);

        await expect(begin(user.id, newEmail, admin.id)).resolves.toEqual({
          status: "in_progress",
        });

        await ageChange(changeId, "2 minutes 5 seconds");
        const retry = await begin(user.id, newEmail, admin.id);
        if (retry.status !== "ok") throw new Error(retry.status);
        await expect(
          complete({ changeId: retry.changeId, user, newEmail }),
        ).resolves.toEqual({ status: "ok" });

        expect(await emailOf(user.id)).toBe(newEmail);
        const rows = await auditRowsFor(user.id);
        expect(rows.map((row) => row.id)).toEqual([changeId, retry.changeId]);
        // The first stays as it stopped: history, not a change still owed.
        expect(rows[0]).toMatchObject({ completedAt: null, lastError: null });
        expect(rows[0].clerkChangedAt).toBeInstanceOf(Date);
        expect(rows[1].completedAt).toBeInstanceOf(Date);
      });
    });

    it("refuses an address another profile holds, in any letter case", async () => {
      const admin = await makeUser("admin", { role: "admin" });
      const user = await makeUser("ana");
      // The unique constraint would let the lowercase twin in.
      const other = await makeUser("Otra.Persona");

      await expect(begin(user.id, other.email, admin.id)).resolves.toEqual({
        status: "email_taken",
      });
      await expect(
        begin(user.id, other.email.toLowerCase(), admin.id),
      ).resolves.toEqual({ status: "email_taken" });
      expect(await auditRowsFor(user.id)).toEqual([]);
    });

    it("refuses a profile that is on its way out", async () => {
      const admin = await makeUser("admin", { role: "admin" });
      const user = await makeUser("ana");
      await integrationDb!
        .insert(pendingUserDeletions)
        .values({ userId: user.id, clerkId: user.clerkId });

      await expect(begin(user.id, address("nueva"), admin.id)).resolves.toEqual(
        { status: "deletion_pending" },
      );
      expect(await auditRowsFor(user.id)).toEqual([]);
    });

    it("ignores a deletion that already finished", async () => {
      const admin = await makeUser("admin", { role: "admin" });
      const user = await makeUser("ana");
      await integrationDb!.insert(pendingUserDeletions).values({
        userId: user.id,
        clerkId: user.clerkId,
        localDeletedAt: new Date(),
      });

      await expect(
        begin(user.id, address("nueva"), admin.id),
      ).resolves.toMatchObject({ status: "ok" });
    });

    it("refuses an address that bounced or reported us", async () => {
      const admin = await makeUser("admin", { role: "admin" });
      const user = await makeUser("ana");
      const blocked = address("rebota");
      await integrationDb!
        .insert(emailSuppressions)
        .values({ emailKey: blocked, reason: "bounce" });

      await expect(
        begin(user.id, blocked.toUpperCase(), admin.id),
      ).resolves.toEqual({ status: "suppressed" });
      expect(await auditRowsFor(user.id)).toEqual([]);
    });

    it("accepts an address whose suppression was lifted", async () => {
      const admin = await makeUser("admin", { role: "admin" });
      const user = await makeUser("ana");
      const unblocked = address("desbloqueada");
      await integrationDb!.insert(emailSuppressions).values({
        emailKey: unblocked,
        reason: "bounce",
        liftedAt: new Date(),
      });

      await expect(begin(user.id, unblocked, admin.id)).resolves.toMatchObject({
        status: "ok",
      });
    });

    describe("when the new address was suppressed after Clerk moved to it", () => {
      async function halfDoneThenSuppressed() {
        const started = await begun();
        await emailChanges.markEmailChangeClerkDone(started.changeId, []);
        await emailChanges.markEmailChangeFailed(
          started.changeId,
          "complete_failed: sqlstate=08006",
        );
        await integrationDb!
          .insert(emailSuppressions)
          .values({ emailKey: started.newEmail, reason: "bounce" });
        return started;
      }

      it("lets the change be finished: the person already signs in with it", async () => {
        const { admin, user, newEmail } = await halfDoneThenSuppressed();

        const retry = await begin(user.id, newEmail, admin.id);

        expect(retry).toMatchObject({ status: "ok", resync: false });
        if (retry.status !== "ok") return;
        await expect(
          complete({ changeId: retry.changeId, user, newEmail }),
        ).resolves.toEqual({ status: "ok" });
        expect(await emailOf(user.id)).toBe(newEmail);
      });

      it("still refuses another suppressed address", async () => {
        const { admin, user } = await halfDoneThenSuppressed();
        const blocked = address("rebota");
        await integrationDb!
          .insert(emailSuppressions)
          .values({ emailKey: blocked, reason: "bounce" });

        await expect(begin(user.id, blocked, admin.id)).resolves.toEqual({
          status: "suppressed",
        });
      });

      it("still refuses once a later run moved Clerk back off that address", async () => {
        const { admin, user, newEmail } = await halfDoneThenSuppressed();
        // A resync at the profile's address: Clerk signs them in with it again.
        const back = await begin(user.id, user.email, admin.id);
        if (back.status !== "ok") throw new Error(back.status);
        await emailChanges.markEmailChangeClerkDone(back.changeId, []);
        await complete({
          changeId: back.changeId,
          user,
          newEmail: user.email,
        });
        expect(await emailOf(user.id)).toBe(user.email);

        await expect(begin(user.id, newEmail, admin.id)).resolves.toEqual({
          status: "suppressed",
        });
      });

      it.each([
        ["to the same address", (newEmail: string) => newEmail],
        ["to another address", () => address("otra").toLowerCase()],
      ])(
        "still refuses after a later attempt %s that failed without saying whether Clerk changed",
        async (_label, target) => {
          const { admin, user, newEmail } = await halfDoneThenSuppressed();
          const later = await begin(user.id, target(newEmail), admin.id);
          if (later.status !== "ok") throw new Error(later.status);
          // A dropped request: Clerk may hold either address now.
          await emailChanges.markEmailChangeFailed(
            later.changeId,
            "clerk_failed: update_email_address:unknown",
          );

          await expect(begin(user.id, newEmail, admin.id)).resolves.toEqual({
            status: "suppressed",
          });
          // Lifting the suppression is the way out.
          await integrationDb!
            .update(emailSuppressions)
            .set({ liftedAt: new Date() })
            .where(eq(emailSuppressions.emailKey, newEmail));
          await expect(
            begin(user.id, newEmail, admin.id),
          ).resolves.toMatchObject({ status: "ok" });
        },
      );

      it("still refuses when that run finished and the profile was put back since", async () => {
        const { admin, user, newEmail, changeId } = await begun();
        await complete({ changeId, user, newEmail });
        // Not through this action, so no later row says so.
        await integrationDb!
          .update(users)
          .set({ email: user.email })
          .where(eq(users.id, user.id));
        await integrationDb!
          .insert(emailSuppressions)
          .values({ emailKey: newEmail, reason: "bounce" });

        await expect(begin(user.id, newEmail, admin.id)).resolves.toEqual({
          status: "suppressed",
        });
      });

      it("still refuses when the earlier run never reached Clerk", async () => {
        const { admin, user, newEmail, changeId } = await begun();
        await emailChanges.markEmailChangeFailed(
          changeId,
          "clerk_failed: get_user:500",
        );
        await integrationDb!
          .insert(emailSuppressions)
          .values({ emailKey: newEmail, reason: "bounce" });

        await expect(begin(user.id, newEmail, admin.id)).resolves.toEqual({
          status: "suppressed",
        });
      });

      it("still refuses when the earlier run completed and the profile has moved on", async () => {
        const { admin, user, newEmail, changeId } = await begun();
        await complete({ changeId, user, newEmail });
        const elsewhere = address("otra").toLowerCase();
        const away = await begin(user.id, elsewhere, admin.id);
        if (away.status !== "ok") throw new Error(away.status);
        await complete({
          changeId: away.changeId,
          user: { id: user.id, email: newEmail },
          newEmail: elsewhere,
        });
        await integrationDb!
          .insert(emailSuppressions)
          .values({ emailKey: newEmail, reason: "bounce" });

        await expect(begin(user.id, newEmail, admin.id)).resolves.toEqual({
          status: "suppressed",
        });
      });
    });

    describe("notices a finished change never sent", () => {
      /** A change that committed and then died before telling anyone. */
      async function completedUntold() {
        const started = await begun("Ana.Mayus");
        await complete(started);
        return started;
      }

      it("are owed on the next resync, for that change and its old address", async () => {
        const { admin, user, newEmail, changeId } = await completedUntold();

        const resync = await begin(user.id, newEmail, admin.id);

        expect(resync).toMatchObject({
          status: "ok",
          resync: true,
          // As stored on that row, not normalized: it is where the notice goes.
          owedNotices: { changeId, oldEmail: user.email },
          arrivedFrom: user.email,
        });
      });

      it("names where the person came from even when nothing is owed", async () => {
        const { admin, user, newEmail, changeId } = await completedUntold();
        await emailChanges.recordEmailChangeNotices(changeId, {
          old: "sent",
          new: "sent",
        });

        await expect(begin(user.id, newEmail, admin.id)).resolves.toMatchObject(
          { resync: true, owedNotices: null, arrivedFrom: user.email },
        );
      });

      it("names nothing for a profile that was never moved", async () => {
        const admin = await makeUser("admin", { role: "admin" });
        const user = await makeUser("quieta");

        await expect(
          begin(user.id, user.email, admin.id),
        ).resolves.toMatchObject({
          resync: true,
          owedNotices: null,
          arrivedFrom: null,
        });
      });

      it("are owed once: not after their outcome is on the row, sent or failed", async () => {
        const { admin, user, newEmail, changeId } = await completedUntold();
        await emailChanges.recordEmailChangeNotices(changeId, {
          old: "sent",
          new: "resend:validation_error",
        });

        await expect(begin(user.id, newEmail, admin.id)).resolves.toMatchObject(
          {
            status: "ok",
            resync: true,
            owedNotices: null,
          },
        );
      });

      it("are still owed after a resync that could not send them either", async () => {
        const { admin, user, newEmail, changeId } = await completedUntold();
        // A resync completes with old and new the same and no notices of its
        // own: it must not hide the row before it.
        const first = await begin(user.id, newEmail, admin.id);
        if (first.status !== "ok") throw new Error(first.status);
        await complete({
          changeId: first.changeId,
          user: { id: user.id, email: newEmail },
          newEmail,
        });

        await expect(begin(user.id, newEmail, admin.id)).resolves.toMatchObject(
          {
            status: "ok",
            owedNotices: { changeId, oldEmail: user.email },
          },
        );
      });

      it("are not owed for a change that never completed", async () => {
        const { admin, user, newEmail, changeId } = await begun();
        await emailChanges.markEmailChangeClerkDone(changeId, []);
        await emailChanges.markEmailChangeFailed(changeId, "complete_failed");
        // The profile got there some other way.
        await integrationDb!
          .update(users)
          .set({ email: newEmail })
          .where(eq(users.id, user.id));

        await expect(begin(user.id, newEmail, admin.id)).resolves.toMatchObject(
          { status: "ok", resync: true, owedNotices: null },
        );
      });

      it("are not owed for an older move to the address once a later one told them", async () => {
        const { admin, user, newEmail } = await completedUntold();
        const elsewhere = address("otra").toLowerCase();
        const away = await begin(user.id, elsewhere, admin.id);
        if (away.status !== "ok") throw new Error(away.status);
        await complete({
          changeId: away.changeId,
          user: { id: user.id, email: newEmail },
          newEmail: elsewhere,
        });
        const back = await begin(user.id, newEmail, admin.id);
        if (back.status !== "ok") throw new Error(back.status);
        await complete({
          changeId: back.changeId,
          user: { id: user.id, email: elsewhere },
          newEmail,
        });
        await emailChanges.recordEmailChangeNotices(back.changeId, {
          old: "sent",
          new: "sent",
        });

        await expect(begin(user.id, newEmail, admin.id)).resolves.toMatchObject(
          { status: "ok", resync: true, owedNotices: null },
        );
      });

      it("are not another person's", async () => {
        const { newEmail } = await completedUntold();
        const admin = await makeUser("admin", { role: "admin" });
        const other = await makeUser("otra");

        await expect(
          begin(other.id, other.email, admin.id),
        ).resolves.toMatchObject({
          status: "ok",
          resync: true,
          owedNotices: null,
        });
        expect(newEmail).not.toBe(other.email);
      });

      it("are not looked for on a change to another address", async () => {
        const { admin, user } = await completedUntold();

        await expect(
          begin(user.id, address("otra"), admin.id),
        ).resolves.toMatchObject({
          status: "ok",
          resync: false,
          owedNotices: null,
        });
      });
    });
  });

  describe("completeEmailChange", () => {
    it("moves the profile to the new address and closes the audit row", async () => {
      const { user, newEmail, changeId } = await begun();

      await expect(
        complete({
          changeId,
          user,
          newEmail,
          unlinkedProviders: ["oauth_google"],
        }),
      ).resolves.toEqual({ status: "ok" });

      expect(await emailOf(user.id)).toBe(newEmail);
      const row = await auditRow(changeId);
      expect(row).toMatchObject({
        unlinkedProviders: ["oauth_google"],
        lastError: null,
      });
      expect(row.clerkChangedAt).toBeInstanceOf(Date);
      expect(row.completedAt).toBeInstanceOf(Date);
    });

    it("keeps the moment Clerk changed when it was already noted", async () => {
      const { user, newEmail, changeId } = await begun();
      await emailChanges.markEmailChangeClerkDone(changeId, ["oauth_google"]);
      const noted = (await auditRow(changeId)).clerkChangedAt;
      expect(noted).toBeInstanceOf(Date);
      expect((await auditRow(changeId)).completedAt).toBeNull();

      await complete({
        changeId,
        user,
        newEmail,
        unlinkedProviders: ["oauth_google"],
      });

      expect((await auditRow(changeId)).clerkChangedAt).toEqual(noted);
    });

    it("moves reservation mail not yet sent and leaves the rest, keys included", async () => {
      const { user, newEmail, changeId } = await begun();
      const other = await makeUser("otra");
      const job = (
        label: string,
        values: Partial<typeof reservationNotificationJobs.$inferInsert>,
      ) => ({
        deduplicationKey: `${label}:${user.email.toLowerCase()}`,
        userId: user.id,
        notificationKind: "reservation_confirmed",
        recipientEmail: user.email,
        payload: {},
        ...values,
      });
      const rows = await integrationDb!
        .insert(reservationNotificationJobs)
        .values([
          job("pending", {}),
          job("processing", { status: "processing" }),
          job("completed", { status: "completed" }),
          job("failed", { status: "failed" }),
          job("other", { userId: other.id, recipientEmail: other.email }),
        ])
        .returning({
          id: reservationNotificationJobs.id,
          deduplicationKey: reservationNotificationJobs.deduplicationKey,
        });

      await complete({ changeId, user, newEmail });

      const after = await integrationDb!
        .select({
          deduplicationKey: reservationNotificationJobs.deduplicationKey,
          recipientEmail: reservationNotificationJobs.recipientEmail,
        })
        .from(reservationNotificationJobs)
        .where(
          inArray(
            reservationNotificationJobs.id,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(reservationNotificationJobs.id));
      expect(after.map((row) => row.recipientEmail)).toEqual([
        newEmail,
        // A worker holds it; if its send fails the row is pending again.
        newEmail,
        user.email,
        user.email,
        other.email,
      ]);
      // The old address stays in the key: it is only a dedup token.
      expect(after.map((row) => row.deduplicationKey)).toEqual(
        rows.map((row) => row.deduplicationKey),
      );
    });

    it("moves unsent disciplinary mail in the column and in the payload it sends from", async () => {
      const { user, newEmail, changeId } = await begun();
      const profile = {
        id: user.id,
        email: user.email,
        displayName: "Ana",
        firstName: null,
        lastName: null,
      };
      const job = (
        label: string,
        values: Partial<typeof disciplinaryNotificationJobs.$inferInsert>,
      ) => ({
        deduplicationKey: key(label),
        userId: user.id,
        entityType: "infraction",
        entityId: 1,
        notificationKind: "infraction_created",
        recipientEmail: user.email,
        payload: { entityType: "infraction", profile, note: "se queda" },
        ...values,
      });
      const rows = await integrationDb!
        .insert(disciplinaryNotificationJobs)
        .values([
          job("pending", {}),
          job("completed", { status: "completed" }),
          job("processing", { status: "processing" }),
          // A retry marker: no profile, and it reads the live one when it runs.
          job("retry", {
            recipientEmail: "",
            payload: { entityType: "sanction_enqueue_retry", sanctionId: 1 },
          }),
        ])
        .returning({ id: disciplinaryNotificationJobs.id });

      await complete({ changeId, user, newEmail });

      const after = await integrationDb!
        .select({
          recipientEmail: disciplinaryNotificationJobs.recipientEmail,
          payload: disciplinaryNotificationJobs.payload,
        })
        .from(disciplinaryNotificationJobs)
        .where(
          inArray(
            disciplinaryNotificationJobs.id,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(disciplinaryNotificationJobs.id));
      const untouched = {
        recipientEmail: user.email,
        payload: { entityType: "infraction", profile, note: "se queda" },
      };
      const moved = {
        recipientEmail: newEmail,
        payload: {
          entityType: "infraction",
          profile: { ...profile, email: newEmail },
          note: "se queda",
        },
      };
      // pending, completed, processing, retry marker.
      expect(after).toEqual([
        moved,
        untouched,
        moved,
        {
          recipientEmail: "",
          payload: { entityType: "sanction_enqueue_retry", sanctionId: 1 },
        },
      ]);
    });

    it("moves unsent transactional deliveries and no others", async () => {
      const { user, newEmail, changeId } = await begun();
      const other = await makeUser("otra");
      const delivery = (
        label: string,
        values: Partial<typeof notificationDeliveries.$inferInsert>,
      ) => ({
        userId: user.id,
        templateKey: "credit_gift_received",
        recipientEmail: user.email,
        idempotencyKey: key(label),
        ...values,
      });
      const rows = await integrationDb!
        .insert(notificationDeliveries)
        .values([
          delivery("pending", {}),
          delivery("processing", { status: "processing" }),
          delivery("sent", { status: "sent" }),
          delivery("failed", { status: "failed" }),
          delivery("skipped", { status: "skipped" }),
          // Tied to a Resend batch; its own drain fails it as address_changed.
          delivery("bulk", { lane: "bulk" }),
          delivery("push", { channel: "push", recipientEmail: null }),
          delivery("other", { userId: other.id, recipientEmail: other.email }),
        ])
        .returning({
          id: notificationDeliveries.id,
          idempotencyKey: notificationDeliveries.idempotencyKey,
        });

      await complete({ changeId, user, newEmail });

      const after = await integrationDb!
        .select({
          idempotencyKey: notificationDeliveries.idempotencyKey,
          recipientEmail: notificationDeliveries.recipientEmail,
        })
        .from(notificationDeliveries)
        .where(
          inArray(
            notificationDeliveries.id,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(notificationDeliveries.id));
      // pending, processing, sent, failed, skipped, bulk, push, other.
      expect(after.map((row) => row.recipientEmail)).toEqual([
        newEmail,
        newEmail,
        user.email,
        user.email,
        user.email,
        user.email,
        null,
        other.email,
      ]);
      expect(after.map((row) => row.idempotencyKey)).toEqual(
        rows.map((row) => row.idempotencyKey),
      );
    });

    it("copies the person's opt-outs to the new address and keeps the old ones", async () => {
      const { admin, user, newEmail, changeId } = await begun("Ana.Mixta");
      const oldKey = user.email.toLowerCase();
      const optedOutAt = new Date("2030-01-02T03:04:05Z");
      await integrationDb!.insert(emailUnsubscribes).values([
        { emailKey: oldKey, topic: "all", createdByUserId: admin.id },
        { emailKey: oldKey, topic: "announcements", createdAt: optedOutAt },
        { emailKey: oldKey, topic: "participant_invitations" },
        // About the mailbox as a visitor or guest buyer: these stay behind.
        { emailKey: oldKey, topic: "news" },
        { emailKey: oldKey, topic: "visitor_invitations" },
        // Already there: copying must not trip over it or replace it.
        { emailKey: newEmail, topic: "participant_invitations" },
      ]);

      await expect(complete({ changeId, user, newEmail })).resolves.toEqual({
        status: "ok",
      });

      const rows = await integrationDb!
        .select()
        .from(emailUnsubscribes)
        .where(inArray(emailUnsubscribes.emailKey, [oldKey, newEmail]));
      const topicsOf = (emailKey: string) =>
        rows
          .filter((row) => row.emailKey === emailKey)
          .map((row) => row.topic)
          .sort();
      expect(topicsOf(newEmail)).toEqual([
        "all",
        "announcements",
        "participant_invitations",
      ]);
      expect(topicsOf(oldKey)).toEqual([
        "all",
        "announcements",
        "news",
        "participant_invitations",
        "visitor_invitations",
      ]);
      // Who did it and when travel with the opt-out.
      const copied = (topic: string) =>
        rows.find((row) => row.emailKey === newEmail && row.topic === topic);
      expect(copied("all")?.createdByUserId).toBe(admin.id);
      expect(copied("announcements")?.createdAt).toEqual(
        rows.find(
          (row) => row.emailKey === oldKey && row.topic === "announcements",
        )?.createdAt,
      );
    });

    it("moves the person's valid tickets, and skips one a guest's address blocks", async () => {
      const { user, newEmail, changeId } = await begun();
      const free = await makeOccurrence();
      const blocked = await makeOccurrence();
      const past = await makeOccurrence();
      const moved = await makeTicket({
        occurrence: free,
        userId: user.id,
        email: user.email,
      });
      // A guest already holds a seat here under the new address, upper-cased:
      // the index is on lower(attendee_email).
      const guest = await makeTicket({
        occurrence: blocked,
        userId: null,
        email: newEmail.toUpperCase(),
      });
      const stuck = await makeTicket({
        occurrence: blocked,
        userId: user.id,
        email: user.email,
      });
      const cancelled = await makeTicket({
        occurrence: past,
        userId: user.id,
        email: user.email,
        status: "cancelled",
      });

      // The collision is skipped, not raised: the rest of the change commits.
      await expect(complete({ changeId, user, newEmail })).resolves.toEqual({
        status: "ok",
      });

      expect(await emailOf(user.id)).toBe(newEmail);
      expect(await ticketEmail(moved)).toBe(newEmail);
      expect(await ticketEmail(stuck)).toBe(user.email);
      expect(await ticketEmail(guest)).toBe(newEmail.toUpperCase());
      expect(await ticketEmail(cancelled)).toBe(user.email);
    });

    it("leaves the tickets behind, and still completes, when a checkout it could not see takes the address", async () => {
      const { user, newEmail, changeId } = await begun();
      const occurrence = await makeOccurrence();
      const elsewhere = await makeOccurrence();
      const contested = await makeTicket({
        occurrence,
        userId: user.id,
        email: user.email,
      });
      const other = await makeTicket({
        occurrence: elsewhere,
        userId: user.id,
        email: user.email,
      });
      await integrationDb!.insert(reservationNotificationJobs).values({
        deduplicationKey: key("job"),
        userId: user.id,
        notificationKind: "reservation_confirmed",
        recipientEmail: user.email,
        payload: {},
      });

      // A guest is buying the same occurrence under the new address and has
      // not committed: the check cannot see the ticket, the index can.
      const rival = await openRival();
      let completing: ReturnType<typeof complete>;
      let guest: number;
      try {
        guest = await makeTicket(
          { occurrence, userId: null, email: newEmail },
          rival.db,
        );
        completing = complete({ changeId, user, newEmail });
        await rival.blocksSomeone();
        await rival.commit();
      } finally {
        await rival.release();
      }

      await expect(completing).resolves.toEqual({ status: "ok" });

      // Clerk already has the address: everything but the tickets follows.
      expect(await emailOf(user.id)).toBe(newEmail);
      const [job] = await integrationDb!
        .select({ recipientEmail: reservationNotificationJobs.recipientEmail })
        .from(reservationNotificationJobs)
        .where(eq(reservationNotificationJobs.userId, user.id));
      expect(job.recipientEmail).toBe(newEmail);
      const row = await auditRow(changeId);
      expect(row.lastError).toBeNull();
      expect(row.completedAt).toBeInstanceOf(Date);
      // One statement, one savepoint: the ticket nobody contested stays too.
      expect(await ticketEmail(contested)).toBe(user.email);
      expect(await ticketEmail(other)).toBe(user.email);
      expect(await ticketEmail(guest)).toBe(newEmail);
    });

    it("does not take any other failure of the ticket update for that one", async () => {
      const { user, newEmail, changeId } = await begun();
      const ticket = await makeTicket({
        occurrence: await makeOccurrence(),
        userId: user.id,
        email: user.email,
      });

      // The update waits on a row lock and is cancelled there: a failure of
      // the same statement that is not the index speaking.
      const rival = await openRival();
      let completing: Promise<unknown>;
      try {
        await rival.client.query(
          "select id from session_tickets where id = $1 for update",
          [ticket],
        );
        completing = complete({ changeId, user, newEmail }).then(
          (result) => result,
          (error: unknown) => ({
            threw: emailChanges.emailChangeErrorCode(error),
          }),
        );
        const waiter = await rival.blocksSomeone();
        await pool!.query("select pg_cancel_backend($1)", [waiter]);
        await completing;
      } finally {
        await rival.release();
      }

      await expect(completing).resolves.toEqual({ threw: "sqlstate=57014" });
      // Nothing half-applied: the whole completion went back.
      expect(await emailOf(user.id)).toBe(user.email);
      expect(await ticketEmail(ticket)).toBe(user.email);
      expect((await auditRow(changeId)).completedAt).toBeNull();
    });

    describe("when a newer change for the same profile started meanwhile", () => {
      /** An older run whose window ran out, and the one that took its place. */
      async function overtaken() {
        const older = await begun();
        await integrationDb!.insert(reservationNotificationJobs).values({
          deduplicationKey: key("job"),
          userId: older.user.id,
          notificationKind: "reservation_confirmed",
          recipientEmail: older.user.email,
          payload: {},
        });
        await ageChange(older.changeId, "2 minutes 5 seconds");
        const newerEmail = address("otra-nueva").toLowerCase();
        const newer = await begin(older.user.id, newerEmail, older.admin.id);
        if (newer.status !== "ok") throw new Error(newer.status);
        return { older, newerEmail, newerId: newer.changeId };
      }

      async function queuedFor(userId: number) {
        const [job] = await integrationDb!
          .select({
            recipientEmail: reservationNotificationJobs.recipientEmail,
          })
          .from(reservationNotificationJobs)
          .where(eq(reservationNotificationJobs.userId, userId));
        return job.recipientEmail;
      }

      it("keeps what the newer one committed", async () => {
        const { older, newerEmail, newerId } = await overtaken();
        const { user } = older;
        await complete({ changeId: newerId, user, newEmail: newerEmail });

        await expect(
          complete({
            changeId: older.changeId,
            user,
            newEmail: older.newEmail,
            unlinkedProviders: ["oauth_google"],
          }),
        ).resolves.toEqual({ status: "superseded" });

        expect(await emailOf(user.id)).toBe(newerEmail);
        expect(await queuedFor(user.id)).toBe(newerEmail);
        const row = await auditRow(older.changeId);
        expect(row).toMatchObject({
          lastError: "superseded",
          completedAt: null,
          // What it did to Clerk is still on record.
          unlinkedProviders: ["oauth_google"],
        });
        expect(row.clerkChangedAt).toBeInstanceOf(Date);
        expect((await auditRow(newerId)).completedAt).toBeInstanceOf(Date);
      });

      it("writes nothing ahead of the newer one, which then completes", async () => {
        const { older, newerEmail, newerId } = await overtaken();
        const { user } = older;

        await expect(
          complete({
            changeId: older.changeId,
            user,
            newEmail: older.newEmail,
          }),
        ).resolves.toEqual({ status: "superseded" });
        expect(await emailOf(user.id)).toBe(user.email);
        expect(await queuedFor(user.id)).toBe(user.email);

        await expect(
          complete({ changeId: newerId, user, newEmail: newerEmail }),
        ).resolves.toEqual({ status: "ok" });
        expect(await emailOf(user.id)).toBe(newerEmail);
      });

      it("does not take another person's change for a newer one", async () => {
        const { user, newEmail, changeId } = await begun();
        // A higher id, for someone else.
        await begun("otra");

        await expect(complete({ changeId, user, newEmail })).resolves.toEqual({
          status: "ok",
        });
      });
    });

    it("records, without throwing, that the profile is gone", async () => {
      const { user, newEmail, changeId } = await begun();
      await integrationDb!.delete(users).where(eq(users.id, user.id));

      await expect(complete({ changeId, user, newEmail })).resolves.toEqual({
        status: "user_gone",
      });

      // The audit outlives the profile, and still names the account.
      expect(await auditRow(changeId)).toMatchObject({
        userId: null,
        clerkId: user.clerkId,
        oldEmail: user.email,
        newEmail,
        lastError: "user_gone",
        completedAt: null,
      });
    });

    it("leaves the profile alone when a deletion started meanwhile", async () => {
      const { user, newEmail, changeId } = await begun();
      await integrationDb!
        .insert(pendingUserDeletions)
        .values({ userId: user.id, clerkId: user.clerkId });

      await expect(complete({ changeId, user, newEmail })).resolves.toEqual({
        status: "deletion_pending",
      });

      expect(await emailOf(user.id)).toBe(user.email);
      const row = await auditRow(changeId);
      expect(row).toMatchObject({
        lastError: "deletion_pending",
        completedAt: null,
      });
      expect(row.clerkChangedAt).toBeInstanceOf(Date);
    });

    it("refuses when another profile took the address meanwhile, in any case", async () => {
      const { user, newEmail, changeId } = await begun();
      await makeUser("intrusa", { email: newEmail.toUpperCase() });

      await expect(complete({ changeId, user, newEmail })).resolves.toEqual({
        status: "email_taken",
      });

      expect(await emailOf(user.id)).toBe(user.email);
      expect(await auditRow(changeId)).toMatchObject({
        lastError: "email_taken",
        completedAt: null,
      });
    });

    it("turns a unique violation into email_taken and still records why", async () => {
      const { user, newEmail, changeId } = await begun();
      await integrationDb!.insert(reservationNotificationJobs).values({
        deduplicationKey: key("job"),
        userId: user.id,
        notificationKind: "reservation_confirmed",
        recipientEmail: user.email,
        payload: {},
      });

      // Another connection inserts the address and has not committed: the
      // check cannot see it, and the update waits on the index for it.
      const rival = await openRival();
      let completing: ReturnType<typeof complete>;
      try {
        await rival.client.query(
          "insert into users (clerk_id, email) values ($1, $2)",
          [key("clerk-rival"), newEmail],
        );
        completing = complete({ changeId, user, newEmail });
        // Committed only once the update is known to be waiting on it.
        await rival.blocksSomeone();
        await rival.commit();
      } finally {
        await rival.release();
      }

      await expect(completing).resolves.toEqual({ status: "email_taken" });

      expect(await emailOf(user.id)).toBe(user.email);
      // The note survived the failed statement, with no address in it.
      expect(await auditRow(changeId)).toMatchObject({
        lastError: "sqlstate=23505 constraint=users_email_unique",
        completedAt: null,
      });
      const [job] = await integrationDb!
        .select({ recipientEmail: reservationNotificationJobs.recipientEmail })
        .from(reservationNotificationJobs)
        .where(eq(reservationNotificationJobs.userId, user.id));
      expect(job.recipientEmail).toBe(user.email);
    });

    it("closes a resync, normalizing the stored address", async () => {
      const admin = await makeUser("admin", { role: "admin" });
      const user = await makeUser("Ana.Mayus");
      const newEmail = user.email.toLowerCase();
      const started = await begin(user.id, user.email, admin.id);
      if (started.status !== "ok") throw new Error(started.status);

      await expect(
        complete({ changeId: started.changeId, user, newEmail }),
      ).resolves.toEqual({ status: "ok" });

      expect(await emailOf(user.id)).toBe(newEmail);
      expect((await auditRow(started.changeId)).completedAt).toBeInstanceOf(
        Date,
      );
    });

    it("converges when the same change is run again after stopping halfway", async () => {
      const { admin, user, newEmail, changeId } = await begun();
      // Clerk changed and the second transaction never ran.
      await emailChanges.markEmailChangeClerkDone(changeId, ["oauth_google"]);
      await emailChanges.markEmailChangeFailed(
        changeId,
        "complete_failed: sqlstate=08006",
      );

      const again = await begin(user.id, newEmail, admin.id);
      if (again.status !== "ok") throw new Error(again.status);
      await complete({ changeId: again.changeId, user, newEmail });

      expect(await emailOf(user.id)).toBe(newEmail);
      const rows = await auditRowsFor(user.id);
      expect(rows.map((row) => row.id)).toEqual([changeId, again.changeId]);
      expect(rows[0]).toMatchObject({
        completedAt: null,
        lastError: "complete_failed: sqlstate=08006",
      });
      expect(rows[0].clerkChangedAt).toBeInstanceOf(Date);
      expect(rows[1].completedAt).toBeInstanceOf(Date);
      expect(rows[1].lastError).toBeNull();
    });
  });

  describe("scrubEmailChangesForUser", () => {
    const scrub = (userId: number) =>
      app.db.transaction((tx) =>
        emailChanges.scrubEmailChangesForUser(tx, userId),
      );

    it("blanks both addresses and keeps the rest, through the deletion", async () => {
      const { admin, user, newEmail, changeId } = await begun();
      await complete({
        changeId,
        user,
        newEmail,
        unlinkedProviders: ["oauth_google"],
      });
      await emailChanges.recordEmailChangeNotices(changeId, {
        old: "resend:validation_error",
        new: "sent",
      });
      const before = await auditRow(changeId);

      // As both deletion paths do: scrub, then delete, in one transaction.
      await app.db.transaction(async (tx) => {
        await emailChanges.scrubEmailChangesForUser(tx, user.id);
        await tx.delete(users).where(eq(users.id, user.id));
      });

      const after = await auditRow(changeId);
      expect(after).toMatchObject({
        id: changeId,
        userId: null,
        clerkId: user.clerkId,
        oldEmail: "",
        newEmail: "",
        changedByUserId: admin.id,
        unlinkedProviders: ["oauth_google"],
        clerkChangedAt: before.clerkChangedAt,
        completedAt: before.completedAt,
        lastError: null,
        oldNoticeStatus: "resend:validation_error",
        newNoticeStatus: "sent",
        createdAt: before.createdAt,
      });
      expect(JSON.stringify(after)).not.toContain("@");
    });

    it("blanks every change of theirs, failed ones included", async () => {
      const { admin, user, newEmail, changeId } = await begun();
      await emailChanges.markEmailChangeFailed(changeId, "clerk_email_taken");
      const again = await begin(user.id, newEmail, admin.id);
      if (again.status !== "ok") throw new Error(again.status);

      await scrub(user.id);

      expect(await auditRowsFor(user.id)).toMatchObject([
        { oldEmail: "", newEmail: "", lastError: "clerk_email_taken" },
        { oldEmail: "", newEmail: "" },
      ]);
    });

    it("leaves other people's changes alone, the ones they made as admin too", async () => {
      const { admin, user, newEmail, changeId } = await begun();

      // The admin is the one going: the addresses are someone else's.
      await scrub(admin.id);

      expect(await auditRow(changeId)).toMatchObject({
        userId: user.id,
        oldEmail: user.email,
        newEmail,
        changedByUserId: admin.id,
      });
    });
  });

  describe("the audit row", () => {
    it("keeps the outcome of each notice", async () => {
      const { changeId } = await begun();

      await emailChanges.recordEmailChangeNotices(changeId, {
        old: "resend:validation_error",
        new: "sent",
      });

      expect(await auditRow(changeId)).toMatchObject({
        oldNoticeStatus: "resend:validation_error",
        newNoticeStatus: "sent",
      });
    });

    it("keeps naming the change once the admin who made it is deleted", async () => {
      const { admin, user, changeId } = await begun();
      await integrationDb!.delete(users).where(eq(users.id, admin.id));

      expect(await auditRow(changeId)).toMatchObject({
        userId: user.id,
        changedByUserId: null,
      });
    });

    /**
     * Two foreign keys to `users`: without a name on both sides the
     * relational query builder throws on every read of either table.
     */
    it("reads both ways through the relational query builder", async () => {
      const { admin, user, changeId } = await begun();

      const subject = await integrationDb!.query.users.findFirst({
        where: eq(users.id, user.id),
        with: { emailChanges: true, emailChangesMade: true },
      });
      const actor = await integrationDb!.query.users.findFirst({
        where: eq(users.id, admin.id),
        with: { emailChanges: true, emailChangesMade: true },
      });
      const change = await integrationDb!.query.userEmailChanges.findFirst({
        where: eq(userEmailChanges.id, changeId),
        with: { user: true, changedBy: true },
      });

      expect(subject?.emailChanges.map((row) => row.id)).toEqual([changeId]);
      expect(subject?.emailChangesMade).toEqual([]);
      expect(actor?.emailChangesMade.map((row) => row.id)).toEqual([changeId]);
      expect(actor?.emailChanges).toEqual([]);
      expect(change?.user?.id).toBe(user.id);
      expect(change?.changedBy?.id).toBe(admin.id);
    });
  });
});
