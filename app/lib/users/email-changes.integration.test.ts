// @vitest-environment node

import { asc, eq, inArray, like, or } from "drizzle-orm";
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

/** Every address, Clerk id and key a test makes carries this, for cleanup. */
const MARK = "mailchg-it";
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

async function makeTicket(input: {
  occurrence: { sessionId: number; occurrenceId: number };
  userId: number | null;
  email: string;
  status?: "valid" | "cancelled";
}) {
  const db = integrationDb!;
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

      const result = await begin(user.id, typed, admin.id);

      expect(result).toEqual({
        status: "ok",
        changeId: expect.any(Number),
        clerkId: user.clerkId,
        // As stored, not normalized: it is where the old notice goes.
        oldEmail: user.email,
        displayName: "Ana Ilustra",
        firstName: "Ana",
        lastName: "Rojas",
      });
      if (result.status !== "ok") return;
      expect(await auditRow(result.changeId)).toMatchObject({
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

    it("refuses the address the profile already has, in any letter case", async () => {
      const admin = await makeUser("admin", { role: "admin" });
      const user = await makeUser("Ana.Mayus");
      expect(user.email).not.toBe(user.email.toLowerCase());

      await expect(begin(user.id, user.email, admin.id)).resolves.toEqual({
        status: "same_email",
      });
      await expect(
        begin(user.id, user.email.toLowerCase(), admin.id),
      ).resolves.toEqual({ status: "same_email" });
      expect(await auditRowsFor(user.id)).toEqual([]);
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

    it("moves pending reservation mail and leaves the rest, keys included", async () => {
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
        // A worker holds the processing row and has already read it.
        user.email,
        user.email,
        user.email,
        other.email,
      ]);
      // The old address stays in the key: it is only a dedup token.
      expect(after.map((row) => row.deduplicationKey)).toEqual(
        rows.map((row) => row.deduplicationKey),
      );
    });

    it("moves pending disciplinary mail in the column and in the payload it sends from", async () => {
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
      expect(after).toEqual([
        {
          recipientEmail: newEmail,
          payload: {
            entityType: "infraction",
            profile: { ...profile, email: newEmail },
            note: "se queda",
          },
        },
        untouched,
        untouched,
        {
          recipientEmail: "",
          payload: { entityType: "sanction_enqueue_retry", sanctionId: 1 },
        },
      ]);
    });

    it("moves pending transactional deliveries and no others", async () => {
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
      expect(after.map((row) => row.recipientEmail)).toEqual([
        newEmail,
        user.email,
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
      const rival = await pool!.connect();
      let completing: ReturnType<typeof complete>;
      try {
        await rival.query("begin");
        await rival.query(
          "insert into users (clerk_id, email) values ($1, $2)",
          [key("clerk-rival"), newEmail],
        );
        completing = complete({ changeId, user, newEmail });
        await new Promise((resolve) => setTimeout(resolve, 400));
        await rival.query("commit");
      } catch (error) {
        await rival.query("rollback");
        throw error;
      } finally {
        rival.release();
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
