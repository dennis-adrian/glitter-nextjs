// @vitest-environment node

import { randomUUID } from "crypto";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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

import * as schema from "@/db/schema";
import {
  disciplinaryNotificationJobs,
  festivals,
  infractions,
  infractionTypes,
  notifications,
  sanctionFestivals,
  sanctionInfractions,
  sanctions,
  users,
} from "@/db/schema";

/**
 * Phase 2 of docs/PRD-in-app-notifications.md, for the disciplinary outbox:
 * every infraction and sanction notice it queues gets an inbox copy for the
 * participant, written in the same transaction as its job, from the same
 * participant-safe snapshot the email renders.
 *
 * Every test watches console.error. A failed copy is caught and logged, never
 * thrown, so without that watch a broken mirror would pass as "no row".
 */

vi.mock("server-only", () => ({}));
// The worker test sends through this mock; nothing here reaches Resend.
const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));
// The inbox queries resolve the viewer from Clerk; every test passes one in.
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));

/**
 * `notify` as shipped, unless a test arms a fault: then the given call runs a
 * statement Postgres rejects (division_by_zero, 22012) on the savepoint's own
 * connection, which is what a real failed insert looks like to the mirror.
 */
const notifyFault = vi.hoisted(() => ({
  failOnCall: null as number | null,
  calls: 0,
}));
vi.mock("@/app/lib/notifications/notify", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/app/lib/notifications/notify")>();
  const { sql } = await import("drizzle-orm");
  const notify = (async (tx, input) => {
    notifyFault.calls += 1;
    if (notifyFault.failOnCall === notifyFault.calls) {
      await tx.execute(sql`select 1/0`);
    }
    return original.notify(tx, input);
  }) as typeof original.notify;
  return { ...original, notify };
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 5 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Disciplinary = typeof import("@/app/lib/infractions/notifications");
type Inbox = typeof import("@/app/lib/notifications/queries");
type AppDb = typeof import("@/db");
let disciplinary: Disciplinary;
let inbox: Inbox;
let app: AppDb;
let supportLine: string;

const MIRROR_FAILURE = "[notifications] Inbox copy";
const HISTORY_LABEL = "Ver mi historial";

type Person = { id: number; email: string; name: string };

const createdUserIds: number[] = [];
const createdFestivalIds: number[] = [];
const createdInfractionIds: number[] = [];
const createdSanctionIds: number[] = [];
const typeIdByCode = new Map<string, { id: number; label: string }>();

async function createUser(role: "user" | "admin" = "user"): Promise<Person> {
  const suffix = randomUUID();
  const name = role === "admin" ? `Admin ${suffix}` : `Ana ${suffix}`;
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `disc-mirror-${suffix}`,
      email: `disc-mirror-${suffix}@example.test`,
      displayName: name,
      firstName: "Ana",
      lastName: "Ilustra",
      role,
      status: "verified",
      category: role === "admin" ? "none" : "illustration",
    })
    .returning({ id: users.id, email: users.email });
  createdUserIds.push(user!.id);
  return { id: user!.id, email: user!.email, name };
}

async function createFestival(): Promise<{ id: number; name: string }> {
  const name = `Glitter Disciplina ${randomUUID().slice(0, 8)}`;
  const [festival] = await integrationDb!
    .insert(festivals)
    .values({
      name,
      status: "active",
      festivalType: "glitter",
      reservationsStartDate: new Date(Date.now() - 86_400_000),
    })
    .returning({ id: festivals.id });
  createdFestivalIds.push(festival!.id);
  return { id: festival!.id, name };
}

/** The labels seeded by drizzle/0211, read rather than assumed. */
async function infractionType(code: string) {
  const cached = typeIdByCode.get(code);
  if (cached) return cached;
  const [row] = await integrationDb!
    .select({ id: infractionTypes.id, label: infractionTypes.label })
    .from(infractionTypes)
    .where(eq(infractionTypes.code, code));
  if (!row) throw new Error(`Infraction type ${code} is not seeded`);
  typeIdByCode.set(code, row);
  return row;
}

async function createInfraction(input: {
  user: Person;
  admin: Person;
  typeCode: string;
  festivalId: number | null;
}) {
  const type = await infractionType(input.typeCode);
  const [row] = await integrationDb!
    .insert(infractions)
    .values({
      userId: input.user.id,
      typeId: type.id,
      festivalId: input.festivalId,
      description: "Registrada por el equipo de logística",
      status: "pending",
      createdByUserId: input.admin.id,
      idempotencyKey: randomUUID(),
    })
    .returning({ id: infractions.id });
  createdInfractionIds.push(row!.id);
  return { id: row!.id, label: type.label };
}

type SanctionInsert = typeof sanctions.$inferInsert;

async function createSanction(input: {
  user: Person;
  admin: Person;
  infractionIds: number[];
  values: Pick<SanctionInsert, "type" | "status" | "festivalScope"> &
    Partial<SanctionInsert>;
}) {
  const now = new Date();
  const [row] = await integrationDb!
    .insert(sanctions)
    .values({
      userId: input.user.id,
      infractionId: input.infractionIds[0] ?? null,
      description: "Descripción interna de la sanción",
      validityUnit: "indefinitely",
      validityDuration: null,
      endsAt: null,
      reservationDelayMinutes: null,
      createdByUserId: input.admin.id,
      approvedByUserId: input.admin.id,
      approvedAt: now,
      ...input.values,
    })
    .returning({ id: sanctions.id });
  createdSanctionIds.push(row!.id);
  if (input.infractionIds.length > 0) {
    await integrationDb!.insert(sanctionInfractions).values(
      input.infractionIds.map((infractionId) => ({
        sanctionId: row!.id,
        infractionId,
        linkedByUserId: input.admin.id,
        linkedAt: now,
      })),
    );
  }
  return row!.id;
}

async function itemsOf(userId: number) {
  return integrationDb!
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(asc(notifications.id));
}

async function jobById(jobId: number) {
  const [job] = await integrationDb!
    .select()
    .from(disciplinaryNotificationJobs)
    .where(eq(disciplinaryNotificationJobs.id, jobId));
  if (!job) throw new Error(`Job ${jobId} not found`);
  return job;
}

async function jobsByKey(deduplicationKey: string) {
  return integrationDb!
    .select()
    .from(disciplinaryNotificationJobs)
    .where(eq(disciplinaryNotificationJobs.deduplicationKey, deduplicationKey));
}

/** Never an address, the participant's or anyone's, nor the acting admin. */
function expectNoContactDetails(
  data: Record<string, unknown>,
  people: Person[],
) {
  const serialized = JSON.stringify(data);
  expect(serialized).not.toContain("@");
  expect(Object.keys(data)).not.toContain("email");
  expect(Object.keys(data)).not.toContain("profile");
  for (const person of people) {
    expect(serialized).not.toContain(person.email);
    expect(serialized).not.toContain(person.name);
  }
}

class RollbackForTest extends Error {}

type IntegrationDb = NonNullable<typeof integrationDb>;
type IntegrationTx = Parameters<Parameters<IntegrationDb["transaction"]>[0]>[0];

/**
 * Runs `work` in a transaction that is always rolled back, and returns what it
 * read inside. A failing `work` rejects with its own error.
 */
async function rollingBack<T>(
  database: IntegrationDb,
  work: (tx: IntegrationTx) => Promise<T>,
): Promise<T> {
  const box: { done: boolean; value?: T } = { done: false };
  try {
    await database.transaction(async (tx) => {
      box.value = await work(tx);
      box.done = true;
      throw new RollbackForTest("rolled back by the test");
    });
  } catch (error) {
    if (!(error instanceof RollbackForTest)) throw error;
  }
  if (!box.done) throw new Error("rollingBack: the work did not complete");
  return box.value as T;
}

describeDatabase("disciplinary outbox → inbox mirror", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleLog: MockInstance<typeof console.log>;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    disciplinary = await import("@/app/lib/infractions/notifications");
    inbox = await import("@/app/lib/notifications/queries");
    app = await import("@/db");
    ({ SUPPORT_LINE: supportLine } =
      await import("@/app/lib/notifications/kinds/copy"));

    try {
      await integrationDb!
        .select({ id: notifications.id })
        .from(notifications)
        .limit(1);
      await infractionType("no_show");
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(() => {
    notifyFault.failOnCall = null;
    notifyFault.calls = 0;
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({
      data: { id: "x" },
      error: null,
      headers: null,
    });
    consoleError = vi.spyOn(console, "error");
    // The app's `db` logs every statement; the worker and inbox go through it.
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Read before cleanup, assert after it, so a failure still cleans up.
    const errors = consoleError.mock.calls.map((args) =>
      args.map((arg) =>
        typeof arg === "string"
          ? arg
          : arg instanceof Error
            ? arg.message
            : JSON.stringify(arg),
      ),
    );
    consoleError.mockRestore();
    consoleLog.mockRestore();
    notifyFault.failOnCall = null;

    const db = integrationDb!;
    const jobFilters = [
      createdUserIds.length > 0
        ? inArray(disciplinaryNotificationJobs.userId, createdUserIds)
        : undefined,
      createdSanctionIds.length > 0
        ? and(
            eq(disciplinaryNotificationJobs.entityType, "sanction"),
            inArray(disciplinaryNotificationJobs.entityId, createdSanctionIds),
          )
        : undefined,
      createdInfractionIds.length > 0
        ? and(
            eq(disciplinaryNotificationJobs.entityType, "infraction"),
            inArray(
              disciplinaryNotificationJobs.entityId,
              createdInfractionIds,
            ),
          )
        : undefined,
    ].filter((filter) => filter !== undefined);
    if (jobFilters.length > 0) {
      await db.delete(disciplinaryNotificationJobs).where(or(...jobFilters));
    }
    if (createdUserIds.length > 0) {
      await db
        .delete(notifications)
        .where(inArray(notifications.userId, createdUserIds));
    }
    // Links, festivals and events cascade with their sanction.
    if (createdSanctionIds.length > 0) {
      await db
        .delete(sanctions)
        .where(inArray(sanctions.id, createdSanctionIds));
    }
    if (createdInfractionIds.length > 0) {
      await db
        .delete(infractions)
        .where(inArray(infractions.id, createdInfractionIds));
    }
    if (createdFestivalIds.length > 0) {
      await db
        .delete(festivals)
        .where(inArray(festivals.id, createdFestivalIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    createdSanctionIds.length = 0;
    createdInfractionIds.length = 0;
    createdFestivalIds.length = 0;
    createdUserIds.length = 0;

    // A mirror failure is swallowed by design: only this catches it.
    expect(
      errors.filter((args) => args.some((arg) => arg.includes(MIRROR_FAILURE))),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("infraction notices", () => {
    it("copies a registered and a voided infraction once each, under Cuenta", async () => {
      const ana = await createUser();
      const admin = await createUser("admin");
      const festival = await createFestival();
      const infraction = await createInfraction({
        user: ana,
        admin,
        typeCode: "no_show",
        festivalId: festival.id,
      });

      const registeredKey = `infraction:${infraction.id}:registered`;
      const registeredJobId = await integrationDb!.transaction((tx) =>
        disciplinary.enqueueInfractionLifecycleNotification(tx, {
          userId: ana.id,
          infractionId: infraction.id,
          kind: "registered",
          deduplicationKey: registeredKey,
        }),
      );

      const voidNote = "La registramos por error: avisaste con anticipación.";
      const voidedAt = new Date();
      const voidedKey = `infraction:${infraction.id}:voided:${voidedAt.toISOString()}`;
      const voidedJobId = await integrationDb!.transaction(async (tx) => {
        await tx
          .update(infractions)
          .set({
            status: "voided",
            voidedAt,
            voidedByUserId: admin.id,
            voidReason: voidNote,
            updatedAt: voidedAt,
          })
          .where(eq(infractions.id, infraction.id));
        return disciplinary.enqueueInfractionLifecycleNotification(tx, {
          userId: ana.id,
          infractionId: infraction.id,
          kind: "voided",
          deduplicationKey: voidedKey,
          participantNote: voidNote,
          now: voidedAt,
        });
      });

      const registeredJob = await jobById(registeredJobId);
      const voidedJob = await jobById(voidedJobId);
      expect(registeredJob).toMatchObject({
        deduplicationKey: registeredKey,
        userId: ana.id,
        status: "pending",
        recipientEmail: ana.email,
      });
      expect(voidedJob.deduplicationKey).toBe(voidedKey);

      const [registered, voided, ...rest] = await itemsOf(ana.id);
      expect(rest).toEqual([]);
      const history = `/profiles/${ana.id}/infractions`;

      expect(registered).toMatchObject({
        kind: "infraction_registered",
        category: "account",
        title: "Se registró una infracción en tu historial",
        body: `El motivo registrado es «${infraction.label}». Corresponde a tu participación en ${festival.name}.\n\n${supportLine}`,
        actionPath: history,
        actionLabel: HISTORY_LABEL,
        dedupeKey: `disciplinary:${registeredJob.deduplicationKey}`,
        readAt: null,
        archivedAt: null,
      });
      expect(registered!.data).toEqual({
        infractionId: infraction.id,
        profileId: ana.id,
        typeLabel: infraction.label,
        festivalName: festival.name,
        note: null,
      });
      expectNoContactDetails(registered!.data, [ana, admin]);

      expect(voided).toMatchObject({
        kind: "infraction_voided",
        category: "account",
        title: "Se anuló una infracción de tu historial",
        actionPath: history,
        actionLabel: HISTORY_LABEL,
        dedupeKey: `disciplinary:${voidedJob.deduplicationKey}`,
        readAt: null,
      });
      // The void note is a paragraph of its own, between the notice and the
      // support line.
      expect(voided!.body.split("\n\n")).toEqual([
        `Anulamos la infracción por «${infraction.label}», así que ya no se tendrá en cuenta.`,
        `Motivo de la anulación: ${voidNote}`,
        supportLine,
      ]);
      expect(voided!.data).toEqual({
        infractionId: infraction.id,
        profileId: ana.id,
        typeLabel: infraction.label,
        festivalName: festival.name,
        note: voidNote,
      });
      expectNoContactDetails(voided!.data, [ana, admin]);

      // The same keys again: the outbox keeps its job, and the inbox gets no
      // second copy.
      const [againRegistered, againVoided] = await integrationDb!.transaction(
        async (tx) => [
          await disciplinary.enqueueInfractionLifecycleNotification(tx, {
            userId: ana.id,
            infractionId: infraction.id,
            kind: "registered",
            deduplicationKey: registeredKey,
          }),
          await disciplinary.enqueueInfractionLifecycleNotification(tx, {
            userId: ana.id,
            infractionId: infraction.id,
            kind: "voided",
            deduplicationKey: voidedKey,
            participantNote: voidNote,
          }),
        ],
      );
      expect(againRegistered).toBe(registeredJobId);
      expect(againVoided).toBe(voidedJobId);
      expect(await jobsByKey(registeredKey)).toHaveLength(1);
      expect(await jobsByKey(voidedKey)).toHaveLength(1);
      expect((await itemsOf(ana.id)).map((row) => row.id)).toEqual([
        registered!.id,
        voided!.id,
      ]);

      // In the inbox: Cuenta has no chip of its own, so they show under
      // Todas, unread, and only the one with a note opens its own page.
      const viewer = { id: ana.id, role: "user" as const };
      const all = await inbox.fetchInboxPage(viewer);
      expect(all.unreadCount).toBe(2);
      expect(
        all.items.map(({ id, kind, category, opensDetail }) => ({
          id,
          kind,
          category,
          opensDetail,
        })),
      ).toEqual([
        {
          id: voided!.id,
          kind: "infraction_voided",
          category: "account",
          opensDetail: true,
        },
        {
          id: registered!.id,
          kind: "infraction_registered",
          category: "account",
          opensDetail: false,
        },
      ]);
      expect(await inbox.fetchUnreadNotificationCount(viewer)).toBe(2);
      for (const filter of ["reservations", "credits", "admin"] as const) {
        const page = await inbox.fetchInboxPage(viewer, { filter });
        expect(page.items, filter).toEqual([]);
      }
    });

    it("copies an infraction with no festival, and none to the admin who registered it", async () => {
      const ana = await createUser();
      const admin = await createUser("admin");
      const infraction = await createInfraction({
        user: ana,
        admin,
        typeCode: "administrative_noncompliance",
        festivalId: null,
      });

      await integrationDb!.transaction((tx) =>
        disciplinary.enqueueInfractionLifecycleNotification(tx, {
          userId: ana.id,
          infractionId: infraction.id,
          kind: "registered",
          deduplicationKey: `infraction:${infraction.id}:registered`,
        }),
      );

      const [row, ...rest] = await itemsOf(ana.id);
      expect(rest).toEqual([]);
      expect(row!.body).toBe(
        `El motivo registrado es «${infraction.label}». No está relacionada con un festival específico.\n\n${supportLine}`,
      );
      expect(row!.data).toMatchObject({ festivalName: null, note: null });
      expect(await itemsOf(admin.id)).toEqual([]);
    });
  });

  describe("sanction notices", () => {
    it("copies an approved sanction with its description, scope and reasons", async () => {
      const ana = await createUser();
      const admin = await createUser("admin");
      const festival = await createFestival();
      const noShow = await createInfraction({
        user: ana,
        admin,
        typeCode: "no_show",
        festivalId: festival.id,
      });
      const late = await createInfraction({
        user: ana,
        admin,
        typeCode: "schedule_noncompliance",
        festivalId: festival.id,
      });
      const sanctionId = await createSanction({
        user: ana,
        admin,
        infractionIds: [noShow.id, late.id],
        values: { type: "warning", status: "active", festivalScope: "glitter" },
      });

      const deduplicationKey = `sanction:${sanctionId}:approved`;
      const jobId = await integrationDb!.transaction((tx) =>
        disciplinary.enqueueSanctionLifecycleNotification(tx, {
          sanctionId,
          kind: "approved",
          deduplicationKey,
        }),
      );

      const job = await jobById(jobId);
      expect(job).toMatchObject({
        deduplicationKey,
        userId: ana.id,
        entityType: "sanction",
        entityId: sanctionId,
        notificationKind: "approved",
      });

      const [row, ...rest] = await itemsOf(ana.id);
      expect(rest).toEqual([]);
      expect(row).toMatchObject({
        kind: "sanction_approved",
        category: "account",
        title: "Se aprobó una sanción en tu historial",
        actionPath: `/profiles/${ana.id}/infractions`,
        actionLabel: HISTORY_LABEL,
        dedupeKey: `disciplinary:${deduplicationKey}`,
        readAt: null,
      });
      // The order of the reasons is whatever the snapshot read; the email
      // lists them in the same order.
      const labels = row!.data.infractionLabels as string[];
      expect([...labels].sort()).toEqual([noShow.label, late.label].sort());
      expect(row!.body).toBe(
        `La sanción consiste en una advertencia. Esta medida se aplica a los festivales de Glitter. La medida se tomó por los siguientes motivos: ${labels.join(", ")}.\n\n${supportLine}`,
      );
      expect(row!.data).toEqual({
        sanctionId,
        profileId: ana.id,
        typeLabel: "Advertencia",
        scopeLabel: "Glitter",
        infractionLabels: labels,
        note: null,
        festivalName: null,
        festivalId: null,
        reservationEligibleAt: null,
      });
      expectNoContactDetails(row!.data, [ana, admin]);
      // The internal description never reaches the participant.
      expect(row!.body).not.toContain("Descripción interna");

      const page = await inbox.fetchInboxPage({ id: ana.id, role: "user" });
      expect(page.items).toEqual([
        expect.objectContaining({
          id: row!.id,
          category: "account",
          opensDetail: false,
        }),
      ]);
    });

    it("commits an expired sanction's job and its copy in one transaction", async () => {
      const ana = await createUser();
      const admin = await createUser("admin");
      const infraction = await createInfraction({
        user: ana,
        admin,
        typeCode: "administrative_noncompliance",
        festivalId: null,
      });
      const day = 86_400_000;
      const sanctionId = await createSanction({
        user: ana,
        admin,
        infractionIds: [infraction.id],
        values: {
          type: "ban",
          status: "expired",
          festivalScope: "global",
          validityUnit: "days",
          validityDuration: 7,
          startsAt: new Date(Date.now() - 10 * day),
          endsAt: new Date(Date.now() - 3 * day),
        },
      });

      // As the expiry cron does it, on the app's own connection pool.
      const deduplicationKey = `sanction:${sanctionId}:expired`;
      const jobId = await app.db.transaction((tx) =>
        disciplinary.enqueueSanctionLifecycleNotification(tx, {
          sanctionId,
          kind: "expired",
          deduplicationKey,
          now: new Date(),
        }),
      );

      const job = await jobById(jobId);
      expect(job).toMatchObject({
        deduplicationKey,
        userId: ana.id,
        status: "pending",
        notificationKind: "expired",
      });

      const [row, ...rest] = await itemsOf(ana.id);
      expect(rest).toEqual([]);
      expect(row).toMatchObject({
        kind: "sanction_expired",
        category: "account",
        title: "Expiró una sanción de tu historial",
        body: `La sanción consistía en un bloqueo del acceso a las reservas. Mientras estuvo vigente, esta medida se aplicó a todos los festivales. La medida se tomó por el siguiente motivo: ${infraction.label}.\n\n${supportLine}`,
        actionPath: `/profiles/${ana.id}/infractions`,
        dedupeKey: `disciplinary:${deduplicationKey}`,
        readAt: null,
      });
      expect(row!.data).toMatchObject({
        sanctionId,
        typeLabel: "Ban",
        scopeLabel: "Global",
        infractionLabels: [infraction.label],
      });
      expectNoContactDetails(row!.data, [ana, admin]);
    });

    it("rolls the job and its copy back with the business change", async () => {
      const ana = await createUser();
      const admin = await createUser("admin");
      const infraction = await createInfraction({
        user: ana,
        admin,
        typeCode: "stand_rules_violation",
        festivalId: null,
      });
      const sanctionId = await createSanction({
        user: ana,
        admin,
        infractionIds: [infraction.id],
        values: { type: "warning", status: "active", festivalScope: "global" },
      });
      const infractionKey = `infraction:${infraction.id}:registered`;
      const sanctionKey = `sanction:${sanctionId}:approved`;

      let writtenInside: string[] = [];
      await expect(
        integrationDb!.transaction(async (tx) => {
          await disciplinary.enqueueInfractionLifecycleNotification(tx, {
            userId: ana.id,
            infractionId: infraction.id,
            kind: "registered",
            deduplicationKey: infractionKey,
          });
          await disciplinary.enqueueSanctionLifecycleNotification(tx, {
            sanctionId,
            kind: "approved",
            deduplicationKey: sanctionKey,
          });
          // Both copies were written, inside the transaction...
          writtenInside = (
            await tx
              .select({ kind: notifications.kind })
              .from(notifications)
              .where(eq(notifications.userId, ana.id))
              .orderBy(asc(notifications.id))
          ).map((row) => row.kind);
          throw new RollbackForTest("the business change failed");
        }),
      ).rejects.toBeInstanceOf(RollbackForTest);

      expect(writtenInside).toEqual([
        "infraction_registered",
        "sanction_approved",
      ]);
      // ...and neither they nor their jobs survive the rollback.
      expect(await jobsByKey(infractionKey)).toEqual([]);
      expect(await jobsByKey(sanctionKey)).toEqual([]);
      expect(await itemsOf(ana.id)).toEqual([]);
    });
  });

  describe("sanction enqueue retries", () => {
    async function expiredBan() {
      const ana = await createUser();
      const admin = await createUser("admin");
      const infraction = await createInfraction({
        user: ana,
        admin,
        typeCode: "no_show",
        festivalId: null,
      });
      const day = 86_400_000;
      const sanctionId = await createSanction({
        user: ana,
        admin,
        infractionIds: [infraction.id],
        values: {
          type: "ban",
          status: "expired",
          festivalScope: "festicker",
          validityUnit: "days",
          validityDuration: 5,
          startsAt: new Date(Date.now() - 8 * day),
          endsAt: new Date(Date.now() - 3 * day),
        },
      });
      return { ana, admin, infraction, sanctionId };
    }

    async function recordRetry(sanctionId: number) {
      const deduplicationKey = `sanction:${sanctionId}:expired`;
      const jobId =
        await disciplinary.recordSanctionLifecycleNotificationEnqueueFailure(
          app.db,
          {
            sanctionId,
            kind: "expired",
            deduplicationKey,
            // Due already, so the worker can claim it right away.
            now: new Date(Date.now() - 1_000),
          },
          new Error("snapshot unavailable"),
        );
      return { jobId, deduplicationKey };
    }

    it("writes no copy for the retry row, then exactly one when the worker hydrates it", async () => {
      const { ana, infraction, sanctionId } = await expiredBan();
      const { jobId, deduplicationKey } = await recordRetry(sanctionId);

      const retry = await jobById(jobId);
      expect(retry).toMatchObject({
        deduplicationKey,
        userId: ana.id,
        recipientEmail: "",
        status: "pending",
        lastError: "snapshot unavailable",
      });
      expect(retry.payload).toMatchObject({
        entityType: "sanction_enqueue_retry",
        sanctionId,
        kind: "expired",
      });
      expect(await itemsOf(ana.id)).toEqual([]);

      const first =
        await disciplinary.attemptDisciplinaryNotificationJob(jobId);
      expect(first).toEqual({ success: true, outcome: "completed" });
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock.mock.calls[0]![0]).toMatchObject({
        to: [ana.email],
        subject: "Expiró una sanción de tu historial",
      });
      expect(sendEmailMock.mock.calls[0]![1]).toEqual({
        idempotencyKey: deduplicationKey,
      });

      const hydrated = await jobById(jobId);
      expect(hydrated).toMatchObject({
        status: "completed",
        recipientEmail: ana.email,
        lastError: null,
      });
      expect(hydrated.payload).toMatchObject({
        entityType: "sanction",
        kind: "expired",
        sanctionId,
      });

      const [row, ...rest] = await itemsOf(ana.id);
      expect(rest).toEqual([]);
      expect(row).toMatchObject({
        kind: "sanction_expired",
        category: "account",
        title: "Expiró una sanción de tu historial",
        body: `La sanción consistía en un bloqueo del acceso a las reservas. Mientras estuvo vigente, esta medida se aplicó a los festivales de Festicker. La medida se tomó por el siguiente motivo: ${infraction.label}.\n\n${supportLine}`,
        actionPath: `/profiles/${ana.id}/infractions`,
        dedupeKey: `disciplinary:${deduplicationKey}`,
      });
      expectNoContactDetails(row!.data, [ana]);

      // Already completed: nothing to claim, no second copy or email.
      const second =
        await disciplinary.attemptDisciplinaryNotificationJob(jobId);
      expect(second).toEqual({ success: false, outcome: "not_claimed" });
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect((await itemsOf(ana.id)).map((item) => item.id)).toEqual([row!.id]);
    });

    it("keeps the one copy when a hydrated retry's send fails and is retried", async () => {
      const { ana, sanctionId } = await expiredBan();
      const { jobId, deduplicationKey } = await recordRetry(sanctionId);

      sendEmailMock.mockResolvedValueOnce({
        data: null,
        error: {
          name: "rate_limit_exceeded",
          message: "Too many requests",
          statusCode: 429,
        },
        headers: null,
      });
      const failed =
        await disciplinary.attemptDisciplinaryNotificationJob(jobId);
      expect(failed).toEqual({ success: false, outcome: "rescheduled" });

      // The hydration and its copy committed before the send was tried.
      const rescheduled = await jobById(jobId);
      expect(rescheduled).toMatchObject({
        status: "pending",
        attempts: 1,
        lastError: "Too many requests",
      });
      expect(rescheduled.payload).toMatchObject({ entityType: "sanction" });
      const [row, ...rest] = await itemsOf(ana.id);
      expect(rest).toEqual([]);
      expect(row).toMatchObject({
        kind: "sanction_expired",
        dedupeKey: `disciplinary:${deduplicationKey}`,
      });

      // Due again now: the next attempt sends the stored snapshot without
      // rebuilding it, and writes no second copy.
      await integrationDb!
        .update(disciplinaryNotificationJobs)
        .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
        .where(eq(disciplinaryNotificationJobs.id, jobId));
      const retried =
        await disciplinary.attemptDisciplinaryNotificationJob(jobId);
      expect(retried).toEqual({ success: true, outcome: "completed" });
      expect(sendEmailMock).toHaveBeenCalledTimes(2);
      expect((await itemsOf(ana.id)).map((item) => item.id)).toEqual([row!.id]);
    });
  });

  describe("reservation access reopening", () => {
    it("files the notice under Reservas, linking to that festival's map", async () => {
      const ana = await createUser();
      const admin = await createUser("admin");
      const festival = await createFestival();
      const infraction = await createInfraction({
        user: ana,
        admin,
        typeCode: "no_show",
        festivalId: null,
      });
      const sanctionId = await createSanction({
        user: ana,
        admin,
        infractionIds: [infraction.id],
        values: {
          type: "reservation_delay",
          status: "active",
          festivalScope: "glitter",
          validityUnit: "festivals",
          validityDuration: 1,
          reservationDelayMinutes: 1440,
        },
      });
      const now = new Date();
      const eligibleAt = new Date(now.getTime() - 60_000);
      await integrationDb!.insert(sanctionFestivals).values({
        sanctionId,
        festivalId: festival.id,
        qualifiedAt: new Date(now.getTime() - 2 * 86_400_000),
        reservationEligibleAt: eligibleAt,
      });
      const deduplicationKey = [
        "sanction",
        sanctionId,
        "festival",
        festival.id,
        "reservation-access",
        eligibleAt.toISOString(),
      ].join(":");

      // The scan covers every eligible association in the database, so it runs
      // in a transaction this test rolls back: anything it queued for rows
      // outside this fixture is undone with it. What it wrote for this
      // fixture is read inside, before the rollback, and asserted after.
      const seen = await rollingBack(integrationDb!, async (tx) => {
        const jobIds =
          await disciplinary.enqueueEnabledReservationAccessNotifications(
            tx,
            now,
          );
        const jobs = await tx
          .select()
          .from(disciplinaryNotificationJobs)
          .where(
            and(
              eq(disciplinaryNotificationJobs.entityType, "sanction"),
              eq(disciplinaryNotificationJobs.entityId, sanctionId),
            ),
          );
        const [marker] = await tx
          .select({
            queuedAt: sanctionFestivals.reservationAccessNotificationQueuedAt,
          })
          .from(sanctionFestivals)
          .where(eq(sanctionFestivals.sanctionId, sanctionId));
        const rows = await tx
          .select()
          .from(notifications)
          .where(eq(notifications.userId, ana.id));
        // The marker keeps the next scan from queueing it again.
        const againJobIds =
          await disciplinary.enqueueEnabledReservationAccessNotifications(
            tx,
            new Date(),
          );
        const rowsAfterAgain = await tx
          .select({ id: notifications.id })
          .from(notifications)
          .where(eq(notifications.userId, ana.id));
        return { jobIds, jobs, marker, rows, againJobIds, rowsAfterAgain };
      });

      const [job, ...otherJobs] = seen.jobs;
      expect(otherJobs).toEqual([]);
      expect(job).toMatchObject({
        deduplicationKey,
        userId: ana.id,
        notificationKind: "reservation_access_enabled",
        recipientEmail: ana.email,
      });
      expect(seen.jobIds).toContain(job!.id);
      expect(seen.marker!.queuedAt).toBeInstanceOf(Date);

      expect(seen.rows).toHaveLength(1);
      const row = seen.rows[0]!;
      expect(row).toMatchObject({
        kind: "sanction_reservation_access_enabled",
        category: "reservations",
        title: "Ya podés acceder a las reservas",
        actionPath: `/profiles/${ana.id}/festivals/${festival.id}/reservations/new`,
        actionLabel: "Reservar mi espacio",
        dedupeKey: `disciplinary:${deduplicationKey}`,
        readAt: null,
      });
      expect(row.body).toMatch(
        new RegExp(
          `^El período de espera de tu sanción finalizó\\. Ya podés acceder a las reservas de ${festival.name} desde el .+\\.$`,
        ),
      );
      expect(row.data).toEqual({
        sanctionId,
        profileId: ana.id,
        typeLabel: "Retraso de reserva",
        scopeLabel: "Glitter",
        infractionLabels: [infraction.label],
        note: null,
        festivalName: festival.name,
        festivalId: festival.id,
        reservationEligibleAt: eligibleAt.toISOString(),
      });
      expectNoContactDetails(row.data, [ana, admin]);

      expect(seen.againJobIds).not.toContain(job!.id);
      expect(seen.rowsAfterAgain).toEqual([{ id: row.id }]);

      // Rolled back: nothing of it is left behind.
      expect(await itemsOf(ana.id)).toEqual([]);
      expect(await jobsByKey(deduplicationKey)).toEqual([]);
    });
  });
  describe("failures and re-queues", () => {
    it("logs a copy that fails and still commits the job with the change", async () => {
      const ana = await createUser();
      const admin = await createUser("admin");
      const infraction = await createInfraction({
        user: ana,
        admin,
        typeCode: "other_policy_violation",
        festivalId: null,
      });
      const deduplicationKey = `infraction:${infraction.id}:registered`;

      notifyFault.failOnCall = notifyFault.calls + 1;
      const jobId = await integrationDb!.transaction(async (tx) => {
        const id = await disciplinary.enqueueInfractionLifecycleNotification(
          tx,
          {
            userId: ana.id,
            infractionId: infraction.id,
            kind: "registered",
            deduplicationKey,
          },
        );
        // The business change after the enqueue still runs on this
        // transaction: the failed savepoint did not abort it.
        await tx
          .update(infractions)
          .set({ status: "under_review" })
          .where(eq(infractions.id, infraction.id));
        return id;
      });

      expect(await jobById(jobId)).toMatchObject({
        deduplicationKey,
        status: "pending",
        recipientEmail: ana.email,
      });
      const [stored] = await integrationDb!
        .select({ status: infractions.status })
        .from(infractions)
        .where(eq(infractions.id, infraction.id));
      expect(stored!.status).toBe("under_review");
      expect(await itemsOf(ana.id)).toEqual([]);

      // Logged with the kind, the job's key and the Postgres code, never the
      // copy's text.
      const mirrorErrors = consoleError.mock.calls.filter(([message]) =>
        String(message).startsWith(MIRROR_FAILURE),
      );
      expect(mirrorErrors).toEqual([
        [
          "[notifications] Inbox copy of a disciplinary notice failed",
          {
            kind: "infraction:registered",
            jobKey: deduplicationKey,
            error: "pg:22012",
          },
        ],
      ]);
      expect(JSON.stringify(mirrorErrors)).not.toContain(ana.email);
      // Expected here; the guard in afterEach checks every other test.
      consoleError.mockClear();
    });

    it("still sends a hydrated retry whose copy failed, and does not try the copy again", async () => {
      const ana = await createUser();
      const admin = await createUser("admin");
      const infraction = await createInfraction({
        user: ana,
        admin,
        typeCode: "no_show",
        festivalId: null,
      });
      const day = 86_400_000;
      const sanctionId = await createSanction({
        user: ana,
        admin,
        infractionIds: [infraction.id],
        values: {
          type: "ban",
          status: "expired",
          festivalScope: "global",
          validityUnit: "days",
          validityDuration: 2,
          startsAt: new Date(Date.now() - 5 * day),
          endsAt: new Date(Date.now() - 3 * day),
        },
      });
      const jobId =
        await disciplinary.recordSanctionLifecycleNotificationEnqueueFailure(
          app.db,
          {
            sanctionId,
            kind: "expired",
            deduplicationKey: `sanction:${sanctionId}:expired`,
            now: new Date(Date.now() - 1_000),
          },
          new Error("snapshot unavailable"),
        );

      notifyFault.failOnCall = notifyFault.calls + 1;
      const result =
        await disciplinary.attemptDisciplinaryNotificationJob(jobId);
      expect(result).toEqual({ success: true, outcome: "completed" });
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(await jobById(jobId)).toMatchObject({
        status: "completed",
        recipientEmail: ana.email,
      });
      expect(await itemsOf(ana.id)).toEqual([]);
      expect(
        consoleError.mock.calls.map(([message, details]) => [message, details]),
      ).toEqual([
        [
          "[notifications] Inbox copy of a disciplinary notice failed",
          {
            kind: "sanction:expired",
            jobKey: `sanction:${sanctionId}:expired`,
            error: "pg:22012",
          },
        ],
      ]);
      consoleError.mockClear();
    });

    it("writes no second copy when a key is queued again after its job was purged", async () => {
      const ana = await createUser();
      const admin = await createUser("admin");
      const infraction = await createInfraction({
        user: ana,
        admin,
        typeCode: "no_show",
        festivalId: null,
      });
      const sanctionId = await createSanction({
        user: ana,
        admin,
        infractionIds: [infraction.id],
        values: { type: "warning", status: "active", festivalScope: "global" },
      });
      const deduplicationKey = `sanction:${sanctionId}:approved`;

      // The purge deletes every completed job past retention in the
      // database, so this runs in a transaction the test rolls back.
      const seen = await rollingBack(integrationDb!, async (tx) => {
        const firstJobId =
          await disciplinary.enqueueSanctionLifecycleNotification(tx, {
            sanctionId,
            kind: "approved",
            deduplicationKey,
          });
        await tx
          .update(disciplinaryNotificationJobs)
          .set({
            status: "completed",
            completedAt: new Date(Date.now() - 8 * 86_400_000),
          })
          .where(eq(disciplinaryNotificationJobs.id, firstJobId));
        const secondJobId =
          await disciplinary.enqueueSanctionLifecycleNotification(tx, {
            sanctionId,
            kind: "approved",
            deduplicationKey,
          });
        const jobs = await tx
          .select({ id: disciplinaryNotificationJobs.id })
          .from(disciplinaryNotificationJobs)
          .where(
            eq(disciplinaryNotificationJobs.deduplicationKey, deduplicationKey),
          );
        const rows = await tx
          .select({
            kind: notifications.kind,
            dedupeKey: notifications.dedupeKey,
          })
          .from(notifications)
          .where(eq(notifications.userId, ana.id));
        return { firstJobId, secondJobId, jobs, rows };
      });

      // The outbox queued a fresh job (and so a second email)...
      expect(seen.secondJobId).not.toBe(seen.firstJobId);
      expect(seen.jobs).toEqual([{ id: seen.secondJobId }]);
      // ...but the inbox is keyed on the event, not the job id.
      expect(seen.rows).toEqual([
        {
          kind: "sanction_approved",
          dedupeKey: `disciplinary:${deduplicationKey}`,
        },
      ]);
    });
  });
});
