// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { DateTime } from "luxon";
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

import { formatDisplayDate, formatFullDate } from "@/app/lib/formatters";
import type { ReservationNotificationInput } from "@/app/lib/reservations/notification-queue";
import * as schema from "@/db/schema";
import {
  creditTopUps,
  festivalDates,
  festivalSectors,
  festivals,
  invoices,
  notifications,
  reservationNotificationJobs,
  reservationParticipants,
  standGroups,
  standReservationStands,
  standReservations,
  stands,
  users,
} from "@/db/schema";

/**
 * Phase 2 of docs/PRD-in-app-notifications.md, end to end against Postgres:
 * the real enqueue helpers queue each reservation email and write its inbox
 * copy in the caller's transaction, read from a real reservation.
 *
 * Every test watches console.error. A mirror that fails is caught and logged,
 * never thrown, so without that watch a broken copy would pass as "no row".
 */

vi.mock("server-only", () => ({}));
// Queuing never sends; the outbox module still imports Resend.
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

type Queue = typeof import("@/app/lib/reservations/notification-queue");
type Outbox = typeof import("@/app/lib/reservations/notification-outbox");
type Inbox = typeof import("@/app/lib/notifications/queries");
let queue: Queue;
let outbox: Outbox;
let inbox: Inbox;

const MIRROR_FAILURE = "[notifications] Inbox copy of a queued email failed";
const LOCATION = "Casa de la Cultura";
// Bolivia is UTC-4: the first day opens at 17:00, so setup is at 16:00.
const FIRST_DAY = new Date("2026-11-14T21:00:00.000Z");
const SECOND_DAY = new Date("2026-11-15T21:00:00.000Z");
const STANDS = "M48 y M49";

type Person = { id: number; email: string; name: string };
type Fixture = {
  festivalId: number;
  festivalName: string;
  standIds: [number, number];
  owner: Person;
  partner: Person;
  admin: Person;
  secondAdmin: Person;
  reservationId: number;
  invoiceId: number;
};

const fixtures: Fixture[] = [];

/**
 * A full table (M48 and M49) booked by Olivia with Pablo as partner, in a
 * festival with a place and two days, plus two admins. Built by direct inserts
 * so nothing but the queue and its mirror is under test.
 */
async function seedFixture(): Promise<Fixture> {
  const db = integrationDb!;
  const suffix = randomUUID().slice(0, 8);

  const [festival] = await db
    .insert(festivals)
    .values({
      name: `Mirror Fest ${suffix}`,
      status: "active",
      festivalType: "glitter",
      locationLabel: LOCATION,
      reservationsStartDate: new Date(Date.now() - 60 * 60 * 1000),
    })
    .returning({ id: festivals.id, name: festivals.name });

  // The later day goes in first: the copy must pick the earliest, not the
  // first row.
  await db.insert(festivalDates).values([
    {
      festivalId: festival!.id,
      startDate: SECOND_DAY,
      endDate: new Date(SECOND_DAY.getTime() + 6 * 3_600_000),
    },
    {
      festivalId: festival!.id,
      startDate: FIRST_DAY,
      endDate: new Date(FIRST_DAY.getTime() + 6 * 3_600_000),
    },
  ]);

  const [sector] = await db
    .insert(festivalSectors)
    .values({ name: `Sector ${suffix}`, festivalId: festival!.id })
    .returning({ id: festivalSectors.id });
  const [table] = await db
    .insert(standGroups)
    .values({
      festivalSectorId: sector!.id,
      type: "full_table",
      fullTablePrice: 500,
    })
    .returning({ id: standGroups.id });
  const standRows = await db
    .insert(stands)
    .values(
      [48, 49].map((standNumber) => ({
        festivalId: festival!.id,
        festivalSectorId: sector!.id,
        standGroupId: table!.id,
        label: "M",
        standNumber,
        standCategory: "illustration" as const,
        status: "reserved" as const,
        price: 280,
        individualPrice: 280,
        sharedPrice: 320,
      })),
    )
    .returning({ id: stands.id, standNumber: stands.standNumber });
  standRows.sort((a, b) => a.standNumber - b.standNumber);

  async function person(
    slug: string,
    displayName: string,
    role: "user" | "admin",
  ): Promise<Person> {
    const email = `mirror-${slug}-${suffix}@example.test`;
    const [row] = await db
      .insert(users)
      .values({
        clerkId: `mirror-${slug}-${suffix}`,
        email,
        displayName,
        role,
        status: "verified",
        category: role === "user" ? "illustration" : "none",
      })
      .returning({ id: users.id });
    return { id: row!.id, email, name: displayName };
  }

  const owner = await person("owner", "Olivia Dueña", "user");
  const partner = await person("partner", "Pablo Socio", "user");
  const admin = await person("admin", "Ada Admin", "admin");
  const secondAdmin = await person("admin2", "Beto Admin", "admin");

  const [reservation] = await db
    .insert(standReservations)
    .values({
      festivalId: festival!.id,
      standId: standRows[0]!.id,
      status: "pending",
      source: "user_reservation",
      ownerUserId: owner.id,
      priceAmountSnapshot: 500,
      individualPriceSnapshot: 280,
      sharedPriceSnapshot: 320,
      fullTablePriceSnapshot: 500,
      bookedParticipantCount: 2,
    })
    .returning({ id: standReservations.id });
  await db.insert(standReservationStands).values(
    standRows.map((stand, position) => ({
      reservationId: reservation!.id,
      standId: stand.id,
      position,
    })),
  );
  await db.insert(reservationParticipants).values([
    { userId: owner.id, reservationId: reservation!.id },
    { userId: partner.id, reservationId: reservation!.id },
  ]);
  const [invoice] = await db
    .insert(invoices)
    .values({
      date: new Date(),
      userId: owner.id,
      reservationId: reservation!.id,
      originalAmount: 500,
      amount: 500,
    })
    .returning({ id: invoices.id });

  const fixture: Fixture = {
    festivalId: festival!.id,
    festivalName: festival!.name,
    standIds: [standRows[0]!.id, standRows[1]!.id],
    owner,
    partner,
    admin,
    secondAdmin,
    reservationId: reservation!.id,
    invoiceId: invoice!.id,
  };
  fixtures.push(fixture);
  return fixture;
}

async function cleanup(fixture: Fixture) {
  const db = integrationDb!;
  const userIds = [
    fixture.owner.id,
    fixture.partner.id,
    fixture.admin.id,
    fixture.secondAdmin.id,
  ];
  await db
    .delete(reservationNotificationJobs)
    .where(
      or(
        inArray(reservationNotificationJobs.userId, userIds),
        eq(reservationNotificationJobs.reservationId, fixture.reservationId),
      ),
    );
  // Members, participations and invoices cascade with the reservation.
  await db
    .delete(standReservations)
    .where(eq(standReservations.festivalId, fixture.festivalId));
  await db.delete(stands).where(eq(stands.festivalId, fixture.festivalId));
  // Notifications and top-ups cascade with their users.
  await db.delete(users).where(inArray(users.id, userIds));
  // Dates, sectors and the table cascade with the festival.
  await db.delete(festivals).where(eq(festivals.id, fixture.festivalId));
}

function participantInput(
  fixture: Fixture,
  recipient: Person,
  overrides: Partial<ReservationNotificationInput> &
    Pick<ReservationNotificationInput, "kind">,
): ReservationNotificationInput {
  return {
    reservationId: fixture.reservationId,
    userId: recipient.id,
    recipientEmail: recipient.email,
    audience: "participant",
    ...overrides,
  };
}

/** Queues jobs the way every call site does: inside its own transaction. */
async function enqueue(
  ...inputs: ReservationNotificationInput[]
): Promise<number[]> {
  const ids = await integrationDb!.transaction((tx) =>
    queue.enqueueReservationNotifications(tx, inputs),
  );
  return ids.map((id) => {
    expect(id).toEqual(expect.any(Number));
    return id!;
  });
}

async function inboxOf(userId: number) {
  return integrationDb!
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(notifications.id);
}

async function jobsOf(userId: number) {
  return integrationDb!
    .select()
    .from(reservationNotificationJobs)
    .where(eq(reservationNotificationJobs.userId, userId))
    .orderBy(reservationNotificationJobs.id);
}

type NotificationRow = typeof notifications.$inferSelect;

/** The one item a person has, checked against the job it mirrors. */
async function onlyItemOf(person: Person, jobId: number) {
  const rows = await inboxOf(person.id);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expectMirrorOf(row, jobId);
  return row;
}

function expectMirrorOf(row: NotificationRow, jobId: number) {
  expect(row.dedupeKey).toBe(`reservation-job:${jobId}`);
  // A snapshot never carries an address, whoever it names.
  const data = JSON.stringify(row.data);
  expect(data).not.toMatch(/@/);
  for (const fixture of fixtures) {
    for (const person of [
      fixture.owner,
      fixture.partner,
      fixture.admin,
      fixture.secondAdmin,
    ]) {
      expect(data).not.toContain(person.email);
    }
  }
  expect(row.archivedAt).toBeNull();
}

function reservationPath(fixture: Fixture, person: Person) {
  return `/profiles/${person.id}/festivals/${fixture.festivalId}/reservations/${fixture.reservationId}`;
}

function viewer(person: Person, role: "user" | "admin" = "user") {
  return { id: person.id, role } as const;
}

describeDatabase("reservation outbox inbox mirrors (Postgres)", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleLog: MockInstance<typeof console.log>;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    queue = await import("@/app/lib/reservations/notification-queue");
    outbox = await import("@/app/lib/reservations/notification-outbox");
    inbox = await import("@/app/lib/notifications/queries");

    try {
      await integrationDb!
        .select({ id: notifications.id })
        .from(notifications)
        .limit(1);
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
    consoleError = vi.spyOn(console, "error");
    // The app's `db` logs every statement; the inbox reads go through it.
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Read before cleanup, assert after it, so a failure still cleans up.
    const unexpectedErrors = consoleError.mock.calls.map((args) =>
      args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))),
    );
    const sends = sendEmailMock.mock.calls.length;
    consoleError.mockRestore();
    consoleLog.mockRestore();
    notifyFault.failOnCall = null;
    for (const fixture of fixtures.splice(0)) {
      await cleanup(fixture);
    }
    // A mirror failure is swallowed by design: only this catches it.
    expect(unexpectedErrors).toEqual([]);
    expect(sends).toBe(0);
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("participant copies", () => {
    it("files the payer's proof receipt under Pagos y créditos, already read", async () => {
      const f = await seedFixture();
      const [jobId] = await enqueue(
        participantInput(f, f.owner, {
          kind: "proof_submitted",
          payload: { invoiceId: f.invoiceId, submissionId: 1 },
        }),
      );

      const row = await onlyItemOf(f.owner, jobId!);
      expect(row).toMatchObject({
        kind: "reservation_proof_submitted",
        category: "credits",
        title: "Recibimos tu comprobante de pago",
        body: `Recibimos el comprobante que subiste para los espacios ${STANDS} en ${f.festivalName}. Te avisamos cuando confirmemos tu reserva.`,
        actionPath: reservationPath(f, f.owner),
        actionLabel: "Ver mi reserva",
      });
      expect(row.readAt).toBeInstanceOf(Date);
      expect(row.data).toEqual({
        reservationId: f.reservationId,
        festivalId: f.festivalId,
        festivalName: f.festivalName,
        standLabel: STANDS,
        standCount: 2,
        profileId: f.owner.id,
      });
    });

    it("files a Bs0 review request under Reservas, already read", async () => {
      const f = await seedFixture();
      const [jobId] = await enqueue(
        participantInput(f, f.owner, { kind: "zero_value_review_requested" }),
      );

      const row = await onlyItemOf(f.owner, jobId!);
      expect(row).toMatchObject({
        kind: "reservation_zero_value_review_requested",
        category: "reservations",
        title: "Tu reserva está en revisión",
        body: `Registramos tu reserva sin costo de los espacios ${STANDS} en ${f.festivalName}. Te avisamos cuando la confirmemos.`,
        actionPath: reservationPath(f, f.owner),
      });
      expect(row.readAt).toBeInstanceOf(Date);
    });

    it("confirms the reservation with the first day's setup time and place", async () => {
      const f = await seedFixture();
      const [jobId] = await enqueue(
        participantInput(f, f.owner, {
          kind: "settlement_approved",
          payload: { invoiceId: f.invoiceId },
        }),
      );

      const row = await onlyItemOf(f.owner, jobId!);
      const setupAt = formatDisplayDate(
        new Date(FIRST_DAY.getTime() - 3_600_000),
        DateTime.TIME_SIMPLE,
      );
      expect(row).toMatchObject({
        kind: "reservation_confirmed",
        category: "reservations",
        title: "¡Tu reserva está confirmada!",
        body: `Confirmamos tu reserva de los espacios ${STANDS} en ${f.festivalName}. Te esperamos el ${formatFullDate(FIRST_DAY)} en ${LOCATION} a las ${setupAt} para armar tus espacios.`,
        actionPath: reservationPath(f, f.owner),
        readAt: null,
      });
      expect(row.data).toMatchObject({
        startsAt: FIRST_DAY.toISOString(),
        locationLabel: LOCATION,
      });
    });

    it("closes a confirmation with ¡Te esperamos! when the festival has no dates", async () => {
      const f = await seedFixture();
      const [jobId] = await integrationDb!.transaction(async (tx) => {
        await tx
          .delete(festivalDates)
          .where(eq(festivalDates.festivalId, f.festivalId));
        return queue.enqueueReservationNotifications(tx, [
          participantInput(f, f.owner, { kind: "settlement_approved" }),
        ]);
      });

      const row = await onlyItemOf(f.owner, jobId!);
      expect(row.body).toBe(
        `Confirmamos tu reserva de los espacios ${STANDS} en ${f.festivalName}. ¡Te esperamos!`,
      );
      expect(row.data).toMatchObject({
        startsAt: null,
        locationLabel: LOCATION,
      });
    });

    it("gives a cancellation with a written reason its own paragraph and page", async () => {
      const f = await seedFixture();
      const reason = "No recibimos el comprobante dentro del plazo.";
      // As the cancellation leaves things when it queues the emails.
      const jobIds = await integrationDb!.transaction(async (tx) => {
        await tx
          .update(standReservations)
          .set({ status: "rejected" })
          .where(eq(standReservations.id, f.reservationId));
        await tx
          .update(invoices)
          .set({ status: "cancelled" })
          .where(eq(invoices.id, f.invoiceId));
        return queue.enqueueReservationNotifications(
          tx,
          [f.owner, f.partner].map((person) =>
            participantInput(f, person, {
              kind: "reservation_rejected",
              payload: { reason },
            }),
          ),
        );
      });

      for (const [index, person] of [f.owner, f.partner].entries()) {
        const row = await onlyItemOf(person, jobIds[index]!);
        expect(row).toMatchObject({
          kind: "reservation_cancelled",
          category: "reservations",
          title: "Tu reserva fue cancelada",
          body: `Cancelamos tu reserva de los espacios ${STANDS} en ${f.festivalName} y los espacios volvieron a quedar disponibles.\n\nMotivo: ${reason}`,
          actionPath: reservationPath(f, person),
          actionLabel: "Ver la reserva",
          readAt: null,
        });
        expect(row.data).toMatchObject({ reason, profileId: person.id });

        const page = await inbox.fetchInboxPage(viewer(person));
        expect(page.items).toHaveLength(1);
        expect(page.items[0]).toMatchObject({
          id: row.id,
          opensDetail: true,
          readAt: null,
        });
        expect(page.unreadCount).toBe(1);
      }
    });

    it("drops a placeholder reason: no Motivo and straight to the reservation", async () => {
      const f = await seedFixture();
      const [jobId] = await enqueue(
        participantInput(f, f.owner, {
          kind: "reservation_rejected",
          payload: { reason: "Actualización administrativa" },
        }),
      );

      const row = await onlyItemOf(f.owner, jobId!);
      expect(row.kind).toBe("reservation_cancelled");
      expect(row.body).toBe(
        `Cancelamos tu reserva de los espacios ${STANDS} en ${f.festivalName} y los espacios volvieron a quedar disponibles.`,
      );
      expect(row.body).not.toContain("Motivo");
      expect(row.data).toMatchObject({ reason: null });

      const page = await inbox.fetchInboxPage(viewer(f.owner));
      expect(page.items[0]).toMatchObject({
        id: row.id,
        opensDetail: false,
        actionPath: reservationPath(f, f.owner),
      });
    });

    it("tells owner and partner apart on a deadline extension, both linking to the reservation", async () => {
      const f = await seedFixture();
      const dueAt = new Date("2026-11-01T22:00:00.000Z");
      const jobIds = await enqueue(
        ...[f.owner, f.partner].map((person) =>
          participantInput(f, person, {
            kind: "deadline_extended",
            payload: { dueAt: dueAt.toISOString() },
            deduplicationKey: `deadline_extended:${f.reservationId}:${dueAt.toISOString()}:${person.email}`,
          }),
        ),
      );

      const owners = await onlyItemOf(f.owner, jobIds[0]!);
      expect(owners).toMatchObject({
        kind: "reservation_payment_deadline_extended",
        category: "credits",
        title: "Tenés más tiempo para pagar tu reserva",
        actionPath: reservationPath(f, f.owner),
        actionLabel: "Ver mi reserva",
        readAt: null,
      });
      expect(owners.body).toContain(
        `Subí el comprobante antes para confirmar tu reserva de los espacios ${STANDS} en ${f.festivalName}.`,
      );
      expect(owners.data).toMatchObject({
        role: "owner",
        ownerName: f.owner.name,
        dueAt: dueAt.toISOString(),
      });

      const partners = await onlyItemOf(f.partner, jobIds[1]!);
      expect(partners).toMatchObject({
        kind: "reservation_payment_deadline_extended",
        category: "credits",
        title: "Hay más tiempo para pagar la reserva que compartís",
        actionPath: reservationPath(f, f.partner),
        actionLabel: "Ver la reserva",
        readAt: null,
      });
      expect(partners.body).toContain(
        `El cobro está a nombre de ${f.owner.name}, así que le toca subir el comprobante.`,
      );
      expect(partners.data).toMatchObject({
        role: "partner",
        ownerName: f.owner.name,
        profileId: f.partner.id,
      });
    });

    it("queues a deadline whose date cannot be read, with no item and no error", async () => {
      const f = await seedFixture();
      const [jobId] = await enqueue(
        participantInput(f, f.owner, {
          kind: "deadline_extended",
          payload: { dueAt: "not a date" },
        }),
      );

      expect((await jobsOf(f.owner.id)).map((job) => job.id)).toEqual([jobId]);
      expect(await inboxOf(f.owner.id)).toEqual([]);
    });

    it("names the released stands and keeps the owner's spend out of the partner's copy", async () => {
      const f = await seedFixture();
      // The release retires every member before it queues the emails.
      const jobIds = await integrationDb!.transaction(async (tx) => {
        await tx
          .update(standReservationStands)
          .set({ releasedAt: new Date() })
          .where(eq(standReservationStands.reservationId, f.reservationId));
        await tx
          .update(standReservations)
          .set({ status: "released" })
          .where(eq(standReservations.id, f.reservationId));
        await tx
          .update(invoices)
          .set({ status: "cancelled" })
          .where(eq(invoices.id, f.invoiceId));
        return queue.enqueueReservationNotifications(
          tx,
          [f.owner, f.partner].map((person) =>
            participantInput(f, person, {
              kind: "reservation_released",
              payload: { creditPrice: 30, releasedStandIds: f.standIds },
            }),
          ),
        );
      });
      const mapPath = (person: Person) =>
        `/profiles/${person.id}/festivals/${f.festivalId}/reservations/new`;

      const owners = await onlyItemOf(f.owner, jobIds[0]!);
      expect(owners).toMatchObject({
        kind: "reservation_released",
        category: "reservations",
        title: "Liberaste tu reserva",
        body: `Liberaste tu reserva de los espacios ${STANDS} en ${f.festivalName}. Esos espacios volvieron al mapa y otra persona puede tomarlos. Se usaron 30 créditos para liberarla y no se devuelven.`,
        actionPath: mapPath(f.owner),
      });
      expect(owners.readAt).toBeInstanceOf(Date);
      expect(owners.data).toMatchObject({
        role: "owner",
        creditPrice: 30,
        standLabel: STANDS,
        standCount: 2,
      });

      const partners = await onlyItemOf(f.partner, jobIds[1]!);
      expect(partners).toMatchObject({
        kind: "reservation_released",
        category: "reservations",
        title: "Se liberó la reserva que compartías",
        body: `${f.owner.name} liberó la reserva de los espacios ${STANDS} que compartían en ${f.festivalName}. Esos espacios volvieron al mapa y otra persona puede tomarlos. Podés hacer una nueva reserva si todavía queda lugar.`,
        actionPath: mapPath(f.partner),
        readAt: null,
      });
      expect(partners.body).not.toMatch(/crédito/);
      expect(partners.data).toMatchObject({
        role: "partner",
        creditPrice: null,
      });

      const [ownerItem] = (await inbox.fetchInboxPage(viewer(f.owner))).items;
      const [partnerItem] = (await inbox.fetchInboxPage(viewer(f.partner)))
        .items;
      expect(ownerItem!.creditDelta).toBe(-30);
      expect(partnerItem!.creditDelta).toBeNull();
    });

    it("tells the owner who they added and the partner that they owe nothing", async () => {
      const f = await seedFixture();
      const actionId = randomUUID();
      const jobIds = await enqueue(
        ...[f.owner, f.partner].map((person) =>
          participantInput(f, person, {
            kind: "late_partner_added",
            deduplicationKey: `late_partner_added:${actionId}:${person.id}`,
            payload: {
              partnerUserId: f.partner.id,
              totalCredits: 20,
              sharedPriceDifference: 40,
              featurePrice: 10,
            },
          }),
        ),
      );

      const owners = await onlyItemOf(f.owner, jobIds[0]!);
      expect(owners).toMatchObject({
        kind: "reservation_partner_added",
        category: "reservations",
        title: `Agregaste a ${f.partner.name} a tu reserva`,
        body: `Ahora compartís los espacios ${STANDS} en ${f.festivalName} con ${f.partner.name}. Se usaron 20 créditos y tu cobro original no cambia.`,
        actionPath: reservationPath(f, f.owner),
      });
      expect(owners.readAt).toBeInstanceOf(Date);
      expect(owners.data).toMatchObject({ role: "owner", totalCredits: 20 });

      const partners = await onlyItemOf(f.partner, jobIds[1]!);
      expect(partners).toMatchObject({
        kind: "reservation_partner_added",
        title: `${f.owner.name} te agregó a su reserva`,
        body: `Van a compartir los espacios ${STANDS} en ${f.festivalName}. No tenés que pagar nada: ${f.owner.name} ya se hizo cargo del costo.`,
        actionPath: reservationPath(f, f.partner),
        actionLabel: "Ver la reserva",
        readAt: null,
      });
      expect(partners.data).toMatchObject({
        role: "partner",
        totalCredits: null,
        partnerName: f.partner.name,
        ownerName: f.owner.name,
      });
    });

    it("mirrors a participation approval, freezing whether reservations were open", async () => {
      const f = await seedFixture();
      const opensAt = new Date(Date.now() + 7 * 86_400_000);
      opensAt.setUTCMilliseconds(0);
      const participation = (person: Person) =>
        participantInput(f, person, {
          kind: "festival_participation_approved",
          reservationId: null,
          payload: { userId: person.id, festivalId: f.festivalId },
        });

      const [openJob] = await enqueue(participation(f.owner));
      // Read inside the transaction that queues it: the later date is what
      // this second copy says, the first keeps what was true for it.
      const [laterJob] = await integrationDb!.transaction(async (tx) => {
        await tx
          .update(festivals)
          .set({ reservationsStartDate: opensAt })
          .where(eq(festivals.id, f.festivalId));
        return queue.enqueueReservationNotifications(tx, [
          participation(f.partner),
        ]);
      });

      for (const [person, jobId] of [
        [f.owner, openJob!],
        [f.partner, laterJob!],
      ] as const) {
        const job = (await jobsOf(person.id))[0]!;
        expect(job.reservationId).toBeNull();
        const row = await onlyItemOf(person, jobId);
        expect(row).toMatchObject({
          kind: "festival_participation_approved",
          category: "reservations",
          title: `Tu postulación para ${f.festivalName} fue aprobada`,
          actionPath: `/festivals/${f.festivalId}/terms`,
          actionLabel: "Reservar mi espacio",
          readAt: null,
        });
      }

      const [opened] = await inboxOf(f.owner.id);
      expect(opened!.body).toBe(
        "Ya podés continuar con la reserva de tu espacio.",
      );
      expect(opened!.data).toMatchObject({ reservationsOpen: true });

      const [waiting] = await inboxOf(f.partner.id);
      expect(waiting!.body).toMatch(
        /^Vas a poder reservar tu espacio desde el .+\.$/,
      );
      expect(waiting!.data).toMatchObject({
        reservationsOpen: false,
        reservationsStartDate: opensAt.toISOString(),
      });
    });

    it("mirrors a participation rejection with its reason, opening its own page", async () => {
      const f = await seedFixture();
      const reason = "El cupo de ilustración ya está completo.";
      const [jobId] = await enqueue(
        participantInput(f, f.owner, {
          kind: "festival_participation_rejected",
          reservationId: null,
          payload: { userId: f.owner.id, festivalId: f.festivalId, reason },
        }),
      );

      const row = await onlyItemOf(f.owner, jobId!);
      expect(row).toMatchObject({
        kind: "festival_participation_rejected",
        category: "reservations",
        title: `Novedades sobre tu postulación para ${f.festivalName}`,
        actionPath: null,
        actionLabel: null,
        readAt: null,
      });
      expect(row.body).toContain(`El motivo que registramos es: ${reason}`);
      expect(row.data).toEqual({
        festivalId: f.festivalId,
        festivalName: f.festivalName,
        reason,
      });

      const [item] = (await inbox.fetchInboxPage(viewer(f.owner))).items;
      expect(item).toMatchObject({ id: row.id, opensDetail: true });
    });

    it("mirrors a rejected top-up with its reason and the debt as of the rejection", async () => {
      const f = await seedFixture();
      const reason = "El monto del comprobante no coincide.";
      const [topUp] = await integrationDb!
        .insert(creditTopUps)
        .values({
          userId: f.owner.id,
          amount: 50,
          status: "rejected",
          intendedUseType: "invoice",
          intendedUseId: f.invoiceId,
          uploadDeadlineAt: new Date(Date.now() + 10 * 60_000),
          voucherUrl: "https://example.test/voucher.png",
          submittedAt: new Date(),
          reviewedByUserId: f.admin.id,
          reviewedAt: new Date(),
          rejectionReason: reason,
          idempotencyKey: randomUUID(),
        })
        .returning({ id: creditTopUps.id });
      const [jobId] = await enqueue({
        kind: "credit_top_up_rejected",
        userId: f.owner.id,
        recipientEmail: f.owner.email,
        audience: "participant",
        deduplicationKey: `credit_top_up_rejected:${topUp!.id}`,
        payload: { topUpId: topUp!.id, debtAmount: 15 },
      });

      const row = await onlyItemOf(f.owner, jobId!);
      expect(row).toMatchObject({
        kind: "credit_top_up_rejected",
        category: "credits",
        title: "No pudimos confirmar tu compra de créditos",
        actionPath: "/my_credits",
        actionLabel: "Ver mi billetera",
        readAt: null,
      });
      expect(row.body).toContain("tu compra de 50 créditos");
      expect(row.body).toContain("saldo pendiente de 15 créditos");
      expect(row.body).toContain(`Motivo: ${reason}`);
      expect(row.data).toEqual({
        topUpId: topUp!.id,
        amount: 50,
        reason,
        debtAmount: 15,
      });

      const [item] = (await inbox.fetchInboxPage(viewer(f.owner))).items;
      expect(item).toMatchObject({ opensDetail: true, creditDelta: -50 });
    });

    it("queues settlement_rejected's email but writes no inbox item", async () => {
      const f = await seedFixture();
      const [jobId] = await enqueue(
        participantInput(f, f.owner, {
          kind: "settlement_rejected",
          payload: { invoiceId: f.invoiceId, creditsReleased: 0 },
        }),
      );

      const jobs = await jobsOf(f.owner.id);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        id: jobId,
        notificationKind: "settlement_rejected",
        status: "pending",
      });
      expect(await inboxOf(f.owner.id)).toEqual([]);
    });
  });

  describe("admin copies through enqueueAdminAndOwnerNotifications", () => {
    it("tells only the admins who did not create the reservation and do not pay it", async () => {
      const f = await seedFixture();
      // The owner is an admin too, paying their own cobro.
      await integrationDb!
        .update(users)
        .set({ role: "admin" })
        .where(eq(users.id, f.owner.id));

      // As admin-actions and hold-service call it: no owner email, every admin.
      const jobIds = await integrationDb!.transaction((tx) =>
        outbox.enqueueAdminAndOwnerNotifications(tx, {
          kind: "reservation_created",
          reservationId: f.reservationId,
          ownerUserId: f.owner.id,
          ownerEmail: null,
          adminEmails: [f.admin, f.secondAdmin, f.owner].map((person) => ({
            id: person.id,
            email: person.email,
          })),
          actorUserId: f.admin.id,
        }),
      );
      // Every admin email still goes out, the actor's and the payer's too.
      expect(jobIds).toHaveLength(3);
      expect(await jobsOf(f.admin.id)).toHaveLength(1);
      expect(await jobsOf(f.owner.id)).toHaveLength(1);

      expect(await inboxOf(f.owner.id)).toEqual([]);
      expect(await inboxOf(f.admin.id)).toEqual([]);

      const [secondAdminJob] = await jobsOf(f.secondAdmin.id);
      expect(secondAdminJob!.deduplicationKey).toBe(
        `reservation_created:${f.reservationId}:admin:${f.secondAdmin.id}`,
      );
      const row = await onlyItemOf(f.secondAdmin, secondAdminJob!.id);
      expect(row).toMatchObject({
        kind: "reservation_created_admin",
        category: "admin",
        title: `Nueva reserva de ${f.owner.name}`,
        body: `Se creó una reserva a nombre de ${f.owner.name} para los espacios ${STANDS} en ${f.festivalName}.`,
        actionPath: `/dashboard/reservations/${f.reservationId}/edit`,
        actionLabel: "Ir a la reserva",
        readAt: null,
      });
      expect(row.data).toEqual({
        reservationId: f.reservationId,
        festivalId: f.festivalId,
        festivalName: f.festivalName,
        standLabel: STANDS,
        standCount: 2,
        participantName: f.owner.name,
      });
    });

    it("gives the paying owner the receipt and every other admin the review item", async () => {
      const f = await seedFixture();
      await integrationDb!
        .update(users)
        .set({ role: "admin" })
        .where(eq(users.id, f.owner.id));

      await integrationDb!.transaction((tx) =>
        outbox.enqueueAdminAndOwnerNotifications(tx, {
          kind: "proof_submitted",
          reservationId: f.reservationId,
          ownerUserId: f.owner.id,
          ownerEmail: f.owner.email,
          // As payment-service passes them: every admin, the payer included.
          adminEmails: [f.admin, f.secondAdmin, f.owner].map((person) => ({
            id: person.id,
            email: person.email,
          })),
          payload: { invoiceId: f.invoiceId, submissionId: 7 },
        }),
      );

      const ownerJobs = await jobsOf(f.owner.id);
      expect(ownerJobs.map((job) => job.deduplicationKey).sort()).toEqual(
        [
          `proof_submitted:${f.reservationId}:${f.owner.email}`,
          `proof_submitted:${f.reservationId}:admin:${f.owner.id}`,
        ].sort(),
      );
      const participantJob = ownerJobs.find(
        (job) => !job.deduplicationKey.includes(":admin:"),
      )!;
      const receipt = await onlyItemOf(f.owner, participantJob.id);
      expect(receipt).toMatchObject({
        kind: "reservation_proof_submitted",
        category: "credits",
      });
      expect(receipt.readAt).toBeInstanceOf(Date);

      for (const admin of [f.admin, f.secondAdmin]) {
        const [job] = await jobsOf(admin.id);
        const row = await onlyItemOf(admin, job!.id);
        expect(row).toMatchObject({
          kind: "reservation_proof_submitted_admin",
          category: "admin",
          title: `${f.owner.name} subió el comprobante de su reserva`,
          body: `${f.owner.name} subió un comprobante de pago para los espacios ${STANDS} en ${f.festivalName}. Está esperando revisión.`,
          actionPath: `/dashboard/festivals/${f.festivalId}/reservations?lens=cobros&reservation=${f.reservationId}`,
          actionLabel: "Revisar el pago",
          readAt: null,
        });
      }
    });

    it("files the Bs0 review and the credits confirmation under the right console lens", async () => {
      const f = await seedFixture();
      for (const kind of [
        "zero_value_review_requested",
        "settlement_approved",
      ] as const) {
        await integrationDb!.transaction((tx) =>
          outbox.enqueueAdminAndOwnerNotifications(tx, {
            kind,
            reservationId: f.reservationId,
            ownerUserId: f.owner.id,
            ownerEmail: f.owner.email,
            adminEmails: [{ id: f.secondAdmin.id, email: f.secondAdmin.email }],
            payload: { invoiceId: f.invoiceId },
          }),
        );
      }

      const rows = await inboxOf(f.secondAdmin.id);
      const jobs = await jobsOf(f.secondAdmin.id);
      expect(rows).toHaveLength(2);
      rows.forEach((row, index) => expectMirrorOf(row, jobs[index]!.id));
      expect(rows[0]).toMatchObject({
        kind: "reservation_zero_value_review_requested_admin",
        category: "admin",
        title: `${f.owner.name} pidió revisar una reserva sin costo`,
        actionPath: `/dashboard/festivals/${f.festivalId}/reservations?lens=cobros&reservation=${f.reservationId}`,
      });
      expect(rows[1]).toMatchObject({
        kind: "reservation_confirmed_with_credits_admin",
        category: "admin",
        title: `${f.owner.name} confirmó su reserva con créditos`,
        actionPath: `/dashboard/festivals/${f.festivalId}/reservations?lens=creditos&reservation=${f.reservationId}`,
      });

      expect((await inboxOf(f.owner.id)).map((row) => row.kind)).toEqual([
        "reservation_zero_value_review_requested",
        "reservation_confirmed",
      ]);
    });
  });

  describe("strict mirror", () => {
    it("writes one item for a job the outbox deduplicates, across transactions and within a batch", async () => {
      const f = await seedFixture();
      const submit = () =>
        integrationDb!.transaction((tx) =>
          outbox.enqueueAdminAndOwnerNotifications(tx, {
            kind: "proof_submitted",
            reservationId: f.reservationId,
            ownerUserId: f.owner.id,
            ownerEmail: f.owner.email,
            adminEmails: [{ id: f.secondAdmin.id, email: f.secondAdmin.email }],
            payload: { invoiceId: f.invoiceId, submissionId: 1 },
          }),
        );

      const first = await submit();
      const second = await submit();
      expect(second).toEqual(first);

      // The same input twice in one batch: one job, one copy.
      const twice = participantInput(f, f.partner, {
        kind: "deadline_extended",
        payload: { dueAt: "2026-11-01T22:00:00.000Z" },
      });
      const [a, b] = await enqueue(twice, twice);
      expect(b).toBe(a);

      for (const person of [f.owner, f.secondAdmin, f.partner]) {
        const jobs = await jobsOf(person.id);
        expect(jobs).toHaveLength(1);
        await onlyItemOf(person, jobs[0]!.id);
      }
    });
  });

  describe("savepoint", () => {
    it("keeps the job and the rest of the transaction when Postgres rejects the copy", async () => {
      const f = await seedFixture();
      notifyFault.failOnCall = 1;

      const outcome = await integrationDb!.transaction(async (tx) => {
        const jobId = await queue.enqueueReservationNotification(
          tx,
          participantInput(f, f.owner, {
            kind: "proof_submitted",
            payload: { invoiceId: f.invoiceId, submissionId: 1 },
          }),
        );
        // The outer transaction is still usable after the savepoint rolled
        // back: a statement after it runs and commits.
        const [after] = await tx
          .update(standReservations)
          .set({ status: "verification_payment" })
          .where(eq(standReservations.id, f.reservationId))
          .returning({ status: standReservations.status });
        return { jobId, status: after!.status };
      });

      expect(outcome.jobId).toEqual(expect.any(Number));
      expect(outcome.status).toBe("verification_payment");
      expect(notifyFault.calls).toBe(1);

      const jobs = await jobsOf(f.owner.id);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.id).toBe(outcome.jobId);
      const [reservation] = await integrationDb!
        .select({ status: standReservations.status })
        .from(standReservations)
        .where(eq(standReservations.id, f.reservationId));
      expect(reservation!.status).toBe("verification_payment");
      expect(await inboxOf(f.owner.id)).toEqual([]);

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(MIRROR_FAILURE, {
        kinds: ["proof_submitted"],
        jobIds: [outcome.jobId],
        error: "pg:22012",
      });
      // Logged with the code alone: no address, no name.
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/@|Olivia/);
      consoleError.mockClear();
    });

    it("loses the whole batch's copies, not its emails, when one copy fails", async () => {
      const f = await seedFixture();
      // The owner's copy is written first; the first admin's then fails.
      notifyFault.failOnCall = 2;

      const jobIds = await integrationDb!.transaction((tx) =>
        outbox.enqueueAdminAndOwnerNotifications(tx, {
          kind: "proof_submitted",
          reservationId: f.reservationId,
          ownerUserId: f.owner.id,
          ownerEmail: f.owner.email,
          adminEmails: [f.admin, f.secondAdmin].map((person) => ({
            id: person.id,
            email: person.email,
          })),
          payload: { invoiceId: f.invoiceId, submissionId: 1 },
        }),
      );

      expect(jobIds).toHaveLength(3);
      expect(notifyFault.calls).toBe(2);
      for (const person of [f.owner, f.admin, f.secondAdmin]) {
        expect(await jobsOf(person.id)).toHaveLength(1);
        expect(await inboxOf(person.id)).toEqual([]);
      }
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(MIRROR_FAILURE, {
        kinds: ["proof_submitted"],
        jobIds,
        error: "pg:22012",
      });
      consoleError.mockClear();

      // A later event mirrors normally: the failure left nothing behind.
      notifyFault.failOnCall = null;
      const [jobId] = await enqueue(
        participantInput(f, f.owner, { kind: "zero_value_review_requested" }),
      );
      await onlyItemOf(f.owner, jobId!);
    });

    it("rolls the copies back with the change they report", async () => {
      const f = await seedFixture();
      await expect(
        integrationDb!.transaction(async (tx) => {
          await queue.enqueueReservationNotification(
            tx,
            participantInput(f, f.owner, { kind: "settlement_approved" }),
          );
          tx.rollback();
        }),
      ).rejects.toThrow();

      expect(await jobsOf(f.owner.id)).toEqual([]);
      expect(await inboxOf(f.owner.id)).toEqual([]);
    });
  });

  describe("inbox read side", () => {
    it("files a participant's mirrored items by category and keeps receipts off the badge", async () => {
      const f = await seedFixture();
      await enqueue(
        participantInput(f, f.owner, { kind: "proof_submitted" }),
        participantInput(f, f.owner, { kind: "settlement_approved" }),
        participantInput(f, f.owner, {
          kind: "deadline_extended",
          payload: { dueAt: "2026-11-01T22:00:00.000Z" },
        }),
        participantInput(f, f.owner, {
          kind: "reservation_rejected",
          payload: { reason: "Pedido de la participante." },
        }),
      );
      const owner = viewer(f.owner);

      const all = await inbox.fetchInboxPage(owner, { filter: "all" });
      // Newest first.
      expect(all.items.map((item) => item.kind)).toEqual([
        "reservation_cancelled",
        "reservation_payment_deadline_extended",
        "reservation_confirmed",
        "reservation_proof_submitted",
      ]);
      expect(all.unreadCount).toBe(3);
      expect(all.isEmptyInbox).toBe(false);
      expect(
        all.items.map((item) => [item.kind, item.opensDetail, !!item.readAt]),
      ).toEqual([
        ["reservation_cancelled", true, false],
        ["reservation_payment_deadline_extended", false, false],
        ["reservation_confirmed", false, false],
        ["reservation_proof_submitted", false, true],
      ]);

      const reservations = await inbox.fetchInboxPage(owner, {
        filter: "reservations",
      });
      expect(reservations.items.map((item) => item.kind)).toEqual([
        "reservation_cancelled",
        "reservation_confirmed",
      ]);
      expect(reservations.unreadCount).toBe(2);

      const credits = await inbox.fetchInboxPage(owner, { filter: "credits" });
      expect(credits.items.map((item) => item.kind)).toEqual([
        "reservation_payment_deadline_extended",
        "reservation_proof_submitted",
      ]);
      expect(credits.unreadCount).toBe(1);

      const unread = await inbox.fetchInboxPage(owner, { unreadOnly: true });
      expect(unread.items).toHaveLength(3);
      expect(await inbox.fetchUnreadNotificationCount(owner)).toBe(3);

      // Inbox items never carry an address.
      expect(JSON.stringify(all)).not.toContain(f.owner.email);
    });

    it("shows admin copies under Administración to admins only", async () => {
      const f = await seedFixture();
      await integrationDb!.transaction((tx) =>
        outbox.enqueueAdminAndOwnerNotifications(tx, {
          kind: "proof_submitted",
          reservationId: f.reservationId,
          ownerUserId: f.owner.id,
          ownerEmail: f.owner.email,
          adminEmails: [{ id: f.secondAdmin.id, email: f.secondAdmin.email }],
        }),
      );

      const asAdmin = viewer(f.secondAdmin, "admin");
      const adminTab = await inbox.fetchInboxPage(asAdmin, { filter: "admin" });
      expect(adminTab.items.map((item) => item.kind)).toEqual([
        "reservation_proof_submitted_admin",
      ]);
      expect(adminTab.items[0]).toMatchObject({
        category: "admin",
        opensDetail: false,
        readAt: null,
      });
      expect(adminTab.unreadCount).toBe(1);
      expect(
        (await inbox.fetchInboxPage(asAdmin, { filter: "all" })).items,
      ).toHaveLength(1);

      // Someone who stopped being an admin keeps no admin mail in view.
      const demoted = viewer(f.secondAdmin, "user");
      const hidden = await inbox.fetchInboxPage(demoted, { filter: "all" });
      expect(hidden.items).toEqual([]);
      expect(hidden.unreadCount).toBe(0);
      expect(hidden.isEmptyInbox).toBe(true);
      expect(
        (await inbox.fetchInboxPage(demoted, { filter: "admin" })).items,
      ).toEqual([]);

      // And the participant sees only their own copy, never the admin one.
      const owners = await inbox.fetchInboxPage(viewer(f.owner), {
        filter: "admin",
      });
      expect(owners.items).toEqual([]);
      const ownersAll = await inbox.fetchInboxPage(viewer(f.owner));
      expect(ownersAll.items.map((item) => item.kind)).toEqual([
        "reservation_proof_submitted",
      ]);
    });
  });
});
