// @vitest-environment node

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
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
  creditLedgerEntries,
  festivalSectors,
  festivals,
  invoiceCreditAllocations,
  invoices,
  participantProducts,
  pendingUserDeletions,
  reservationFeatureActionItems,
  reservationFeatureActions,
  reservationParticipants,
  reservationRequestRegistry,
  scheduledTasks,
  standReservationEvents,
  standReservationStands,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";

const currentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  getCurrentBaseProfile: currentProfileMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The deadline extension below queues a participant notice; nothing here
// should reach a mail provider.
vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueAdminAndOwnerNotifications: vi.fn().mockResolvedValue([]),
  enqueueReservationNotifications: vi.fn().mockResolvedValue([]),
  enqueueReservationNotification: vi.fn().mockResolvedValue(null),
  scheduleReservationNotificationJobs: vi.fn(),
}));

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
  ? new Pool({ connectionString: testDatabaseUrl, max: 5 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Fixture = { festivalIds: number[]; userIds: number[] };
const fixtures: Fixture[] = [];

let service: typeof import("@/app/lib/reservations/participant-transfer-service");

describeDatabase("admin participation transfer", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    service =
      await import("@/app/lib/reservations/participant-transfer-service");
  }, 60_000);

  afterEach(async () => {
    currentProfileMock.mockReset();
    const db = integrationDb!;
    for (const fixture of fixtures.splice(0)) {
      const reservationIds = (
        await db
          .select({ id: standReservations.id })
          .from(standReservations)
          .where(inArray(standReservations.festivalId, fixture.festivalIds))
      ).map((row) => row.id);
      if (reservationIds.length > 0) {
        await db
          .delete(invoices)
          .where(inArray(invoices.reservationId, reservationIds));
        await db
          .delete(scheduledTasks)
          .where(inArray(scheduledTasks.reservationId, reservationIds));
        await db
          .delete(standReservationEvents)
          .where(inArray(standReservationEvents.reservationId, reservationIds));
        // Products cascade from their participation.
        await db
          .delete(reservationParticipants)
          .where(
            inArray(reservationParticipants.reservationId, reservationIds),
          );
        await db
          .delete(standReservationStands)
          .where(inArray(standReservationStands.reservationId, reservationIds));
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, reservationIds));
      }
      // The ledger is append-only, enforced by a trigger, and its user FK is
      // `restrict`; dropped only for this delete and restored at once.
      const client = await pool!.connect();
      try {
        await client.query(
          "ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only",
        );
        await client.query(
          "DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])",
          [fixture.userIds],
        );
      } finally {
        await client.query(
          "ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only",
        );
        client.release();
      }
      // Items cascade from their action.
      await db
        .delete(reservationFeatureActions)
        .where(
          inArray(reservationFeatureActions.festivalId, fixture.festivalIds),
        );
      await db
        .delete(stands)
        .where(inArray(stands.festivalId, fixture.festivalIds));
      await db
        .delete(festivalSectors)
        .where(inArray(festivalSectors.festivalId, fixture.festivalIds));
      await db
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.userId, fixture.userIds));
      await db
        .delete(userRequests)
        .where(inArray(userRequests.userId, fixture.userIds));
      await db
        .delete(reservationRequestRegistry)
        .where(
          inArray(reservationRequestRegistry.actorUserId, fixture.userIds),
        );
      await db.delete(users).where(inArray(users.id, fixture.userIds));
      await db
        .delete(festivals)
        .where(inArray(festivals.id, fixture.festivalIds));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function seed(input: {
    festivalStatus?: "active" | "archived";
    accounts?: number;
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Transfer ${suffix}`,
        status: input.festivalStatus ?? "archived",
        festivalType: "glitter",
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();
    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `tr-admin-${suffix}`,
        email: `tr-admin-${suffix}@example.test`,
        displayName: `TR Admin ${suffix}`,
        status: "verified",
        role: "admin",
      })
      .returning();
    const accounts = await db
      .insert(users)
      .values(
        Array.from({ length: input.accounts ?? 3 }, (_, index) => ({
          clerkId: `tr-${suffix}-${index}`,
          email: `tr-${suffix}-${index}@example.test`,
          displayName: `TR ${suffix}-${index}`,
          status: "verified" as const,
          category: "illustration" as const,
        })),
      )
      .returning();
    const [sector] = await db
      .insert(festivalSectors)
      .values({
        name: `S ${suffix}`,
        festivalId: festival.id,
        orderInFestival: 1,
      })
      .returning();
    const standRows = await db
      .insert(stands)
      .values(
        [1, 2, 3].map((standNumber) => ({
          festivalId: festival.id,
          festivalSectorId: sector.id,
          standNumber,
          standCategory: "illustration" as const,
          status: "available" as const,
          price: 100,
          individualPrice: 100,
          sharedPrice: 150,
        })),
      )
      .returning();

    fixtures.push({
      festivalIds: [festival.id],
      userIds: [admin.id, ...accounts.map((account) => account.id)],
    });
    currentProfileMock.mockResolvedValue({
      id: admin.id,
      role: "admin",
      status: "verified",
    });
    return { festival, admin, accounts, standRows };
  }

  async function enroll(userId: number, festivalId: number) {
    const [row] = await integrationDb!
      .insert(userRequests)
      .values({
        userId,
        festivalId,
        type: "festival_participation",
        status: "accepted",
      })
      .returning();
    return row;
  }

  async function seedReservation(input: {
    festivalId: number;
    standId: number;
    ownerUserId: number;
    participantUserIds?: number[];
    status?: "pending" | "accepted" | "rejected";
  }) {
    const db = integrationDb!;
    const status = input.status ?? "accepted";
    const participantUserIds = input.participantUserIds ?? [input.ownerUserId];
    const [reservation] = await db
      .insert(standReservations)
      .values({
        festivalId: input.festivalId,
        standId: input.standId,
        status,
        source: "user_reservation",
        ownerUserId: input.ownerUserId,
        priceAmountSnapshot: 100,
        individualPriceSnapshot: 100,
        sharedPriceSnapshot: 150,
        bookedParticipantCount: participantUserIds.length,
      })
      .returning();
    await db.insert(standReservationStands).values({
      reservationId: reservation.id,
      standId: input.standId,
      position: 0,
    });
    const participations = await db
      .insert(reservationParticipants)
      .values(
        participantUserIds.map((userId) => ({
          userId,
          reservationId: reservation.id,
          hasStamp: userId === input.ownerUserId,
        })),
      )
      .returning();
    const [invoice] = await db
      .insert(invoices)
      .values({
        date: new Date(),
        userId: input.ownerUserId,
        reservationId: reservation.id,
        originalAmount: 100,
        amount: 100,
        status: status === "accepted" ? "paid" : "pending",
      })
      .returning();
    const [task] = await db
      .insert(scheduledTasks)
      .values({
        dueDate: new Date(Date.now() + 86_400_000),
        reminderTime: new Date(Date.now() + 3_600_000),
        profileId: input.ownerUserId,
        reservationId: reservation.id,
        taskType: "stand_reservation",
      })
      .returning();
    return { reservation, participations, invoice, task };
  }

  it("moves a past holder's participation, ownership, cobro, reminders, products and enrollment", async () => {
    const db = integrationDb!;
    const { festival, admin, accounts, standRows } = await seed({});
    const [oldAccount, newAccount] = accounts;
    const enrollment = await enroll(oldAccount.id, festival.id);
    const { reservation, participations, invoice, task } =
      await seedReservation({
        festivalId: festival.id,
        standId: standRows[0].id,
        ownerUserId: oldAccount.id,
      });
    await db.insert(participantProducts).values({
      userId: oldAccount.id,
      participationId: participations[0].id,
      imageUrl: "https://example.test/p.png",
      name: "Print",
    });

    const preview = await service.previewParticipantTransfer({
      reservationId: reservation.id,
      fromUserId: oldAccount.id,
      toUserId: newAccount.id,
    });
    expect(preview.success).toBe(true);
    if (!preview.success) return;
    expect(preview.data.plan.moves).toEqual([
      "La participación en la reserva",
      "La titularidad de la reserva",
      "1 cobro a su nombre",
      "Los recordatorios de pago",
      "1 producto enviado para el festival",
      "La inscripción al festival",
    ]);

    const idempotencyKey = randomUUID();
    const result = await service.transferReservationParticipation({
      reservationId: reservation.id,
      fromUserId: oldAccount.id,
      toUserId: newAccount.id,
      idempotencyKey,
      note: "Perdió el acceso",
    });
    expect(result).toMatchObject({
      success: true,
      data: { participationId: participations[0].id },
    });

    const [participation] = await db
      .select()
      .from(reservationParticipants)
      .where(eq(reservationParticipants.id, participations[0].id));
    // The same row, stamp and all.
    expect(participation).toMatchObject({
      userId: newAccount.id,
      hasStamp: true,
    });
    const [after] = await db
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, reservation.id));
    expect(after).toMatchObject({
      ownerUserId: newAccount.id,
      status: "accepted",
      standId: standRows[0].id,
      priceAmountSnapshot: 100,
    });
    const [invoiceAfter] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoice.id));
    expect(invoiceAfter).toMatchObject({ userId: newAccount.id, amount: 100 });
    const [taskAfter] = await db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, task.id));
    expect(taskAfter.profileId).toBe(newAccount.id);
    const products = await db
      .select()
      .from(participantProducts)
      .where(eq(participantProducts.participationId, participations[0].id));
    expect(products.map((row) => row.userId)).toEqual([newAccount.id]);
    const [enrollmentAfter] = await db
      .select()
      .from(userRequests)
      .where(eq(userRequests.id, enrollment.id));
    expect(enrollmentAfter.userId).toBe(newAccount.id);

    const events = await db
      .select()
      .from(standReservationEvents)
      .where(eq(standReservationEvents.reservationId, reservation.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorUserId: admin.id,
      eventType: "status_changed",
      fromStatus: "accepted",
      toStatus: "accepted",
      payload: {
        kind: "participant_transferred",
        fromUserId: oldAccount.id,
        toUserId: newAccount.id,
        movedOwnership: true,
        invoiceIds: [invoice.id],
        enrollment: "move",
        reason: "Perdió el acceso",
      },
    });

    // A retry whose answer was lost replays instead of failing on "the old
    // account is not on it any more".
    const replay = await service.transferReservationParticipation({
      reservationId: reservation.id,
      fromUserId: oldAccount.id,
      toUserId: newAccount.id,
      idempotencyKey,
    });
    expect(replay).toMatchObject({
      success: true,
      message: "La participación ya fue transferida.",
    });
    const eventsAfterReplay = await db
      .select({ id: standReservationEvents.id })
      .from(standReservationEvents)
      .where(eq(standReservationEvents.reservationId, reservation.id));
    expect(eventsAfterReplay).toHaveLength(1);

    // A fresh attempt, by contrast, is judged on what is there now.
    const again = await service.transferReservationParticipation({
      reservationId: reservation.id,
      fromUserId: oldAccount.id,
      toUserId: newAccount.id,
      idempotencyKey: randomUUID(),
    });
    expect(again).toMatchObject({
      success: false,
      code: "TRANSFER_NOT_PARTICIPANT",
    });
  });

  it("moves only a partner's own participation and leaves the holder's things alone", async () => {
    const db = integrationDb!;
    const { festival, accounts, standRows } = await seed({ accounts: 3 });
    const [holder, oldPartner, newPartner] = accounts;
    await enroll(holder.id, festival.id);
    await enroll(oldPartner.id, festival.id);
    const { reservation, invoice, task } = await seedReservation({
      festivalId: festival.id,
      standId: standRows[0].id,
      ownerUserId: holder.id,
      participantUserIds: [holder.id, oldPartner.id],
    });

    const result = await service.transferReservationParticipation({
      reservationId: reservation.id,
      fromUserId: oldPartner.id,
      toUserId: newPartner.id,
      idempotencyKey: randomUUID(),
    });
    expect(result.success).toBe(true);

    const participants = await db
      .select({ userId: reservationParticipants.userId })
      .from(reservationParticipants)
      .where(eq(reservationParticipants.reservationId, reservation.id));
    expect(participants.map((row) => row.userId).sort()).toEqual(
      [holder.id, newPartner.id].sort(),
    );
    const [after] = await db
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, reservation.id));
    expect(after.ownerUserId).toBe(holder.id);
    const [invoiceAfter] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoice.id));
    expect(invoiceAfter.userId).toBe(holder.id);
    const [taskAfter] = await db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, task.id));
    expect(taskAfter.profileId).toBe(holder.id);
  });

  it("copies the enrollment when the old account still takes part in the festival", async () => {
    const db = integrationDb!;
    const { festival, accounts, standRows } = await seed({});
    const [oldAccount, newAccount] = accounts;
    const enrollment = await enroll(oldAccount.id, festival.id);
    const first = await seedReservation({
      festivalId: festival.id,
      standId: standRows[0].id,
      ownerUserId: oldAccount.id,
    });
    await seedReservation({
      festivalId: festival.id,
      standId: standRows[1].id,
      ownerUserId: oldAccount.id,
    });

    const result = await service.transferReservationParticipation({
      reservationId: first.reservation.id,
      fromUserId: oldAccount.id,
      toUserId: newAccount.id,
      idempotencyKey: randomUUID(),
    });
    expect(result.success).toBe(true);

    const rows = await db
      .select({ userId: userRequests.userId, status: userRequests.status })
      .from(userRequests)
      .where(
        and(
          eq(userRequests.festivalId, festival.id),
          inArray(userRequests.userId, [oldAccount.id, newAccount.id]),
        ),
      );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "accepted")).toBe(true);
    const [kept] = await db
      .select()
      .from(userRequests)
      .where(eq(userRequests.id, enrollment.id));
    expect(kept.userId).toBe(oldAccount.id);
  });

  it("refuses a live transfer to an account that already holds a stand in the festival", async () => {
    const db = integrationDb!;
    const { festival, accounts, standRows } = await seed({
      festivalStatus: "active",
    });
    const [oldAccount, newAccount] = accounts;
    const { reservation } = await seedReservation({
      festivalId: festival.id,
      standId: standRows[0].id,
      ownerUserId: oldAccount.id,
      status: "pending",
    });
    await seedReservation({
      festivalId: festival.id,
      standId: standRows[1].id,
      ownerUserId: newAccount.id,
      status: "pending",
    });

    const idempotencyKey = randomUUID();
    const result = await service.transferReservationParticipation({
      reservationId: reservation.id,
      fromUserId: oldAccount.id,
      toUserId: newAccount.id,
      idempotencyKey,
    });
    expect(result).toMatchObject({
      success: false,
      code: "TRANSFER_TARGET_ALREADY_RESERVED",
    });
    const [unchanged] = await db
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, reservation.id));
    expect(unchanged.ownerUserId).toBe(oldAccount.id);
    // A refusal releases its key, so the next decision can run.
    const registry = await db
      .select()
      .from(reservationRequestRegistry)
      .where(eq(reservationRequestRegistry.requestKey, idempotencyKey));
    expect(registry).toEqual([]);
  });

  it("refuses an account that is already on the reservation, or not a participant account", async () => {
    const db = integrationDb!;
    const { festival, admin, accounts, standRows } = await seed({});
    const [holder, partner, pendingAccount] = accounts;
    await db
      .update(users)
      .set({ status: "pending" })
      .where(eq(users.id, pendingAccount.id));
    const { reservation } = await seedReservation({
      festivalId: festival.id,
      standId: standRows[0].id,
      ownerUserId: holder.id,
      participantUserIds: [holder.id, partner.id],
    });

    const attempt = (toUserId: number) =>
      service.transferReservationParticipation({
        reservationId: reservation.id,
        fromUserId: holder.id,
        toUserId,
        idempotencyKey: randomUUID(),
      });
    expect(await attempt(partner.id)).toMatchObject({
      code: "TRANSFER_TARGET_ALREADY_PARTICIPANT",
    });
    expect(await attempt(pendingAccount.id)).toMatchObject({
      code: "TRANSFER_TARGET_NOT_ELIGIBLE",
    });
    expect(await attempt(admin.id)).toMatchObject({
      code: "TRANSFER_TARGET_NOT_ELIGIBLE",
    });
  });

  it("is a global-admin command", async () => {
    const { festival, accounts, standRows } = await seed({});
    const [oldAccount, newAccount] = accounts;
    const { reservation } = await seedReservation({
      festivalId: festival.id,
      standId: standRows[0].id,
      ownerUserId: oldAccount.id,
    });
    currentProfileMock.mockResolvedValue({
      id: oldAccount.id,
      role: "festival_admin",
      status: "verified",
    });

    const input = {
      reservationId: reservation.id,
      fromUserId: oldAccount.id,
      toUserId: newAccount.id,
    };
    expect(await service.previewParticipantTransfer(input)).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
    expect(
      await service.transferReservationParticipation({
        ...input,
        idempotencyKey: randomUUID(),
      }),
    ).toMatchObject({ success: false, code: "UNAUTHORIZED" });
  });

  it("makes the target the owner of a legacy reservation it now holds", async () => {
    const db = integrationDb!;
    // Accounts are created in order, so the old account has the lowest id: a
    // legacy row with no owner and no cobro derives its holder from it.
    const { festival, accounts, standRows } = await seed({ accounts: 3 });
    const [oldAccount, companion, newAccount] = accounts;
    const [reservation] = await db
      .insert(standReservations)
      .values({
        festivalId: festival.id,
        standId: standRows[0].id,
        status: "accepted",
        source: "legacy_unknown",
        ownerUserId: null,
        bookedParticipantCount: 2,
      })
      .returning();
    await db.insert(standReservationStands).values({
      reservationId: reservation.id,
      standId: standRows[0].id,
      position: 0,
    });
    await db.insert(reservationParticipants).values([
      { userId: oldAccount.id, reservationId: reservation.id },
      { userId: companion.id, reservationId: reservation.id },
    ]);

    const result = await service.transferReservationParticipation({
      reservationId: reservation.id,
      fromUserId: oldAccount.id,
      toUserId: newAccount.id,
      idempotencyKey: randomUUID(),
    });
    expect(result.success).toBe(true);

    const [after] = await db
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, reservation.id));
    // Without it the companion, now the lowest id, would hold it.
    expect(after.ownerUserId).toBe(newAccount.id);
    const [event] = await db
      .select({ payload: standReservationEvents.payload })
      .from(standReservationEvents)
      .where(eq(standReservationEvents.reservationId, reservation.id));
    expect(event.payload).toMatchObject({ movedOwnership: true });
  });

  it("refuses an account whose deletion is under way", async () => {
    const db = integrationDb!;
    const { festival, accounts, standRows } = await seed({});
    const [oldAccount, newAccount] = accounts;
    const { reservation } = await seedReservation({
      festivalId: festival.id,
      standId: standRows[0].id,
      ownerUserId: oldAccount.id,
    });
    await db.insert(pendingUserDeletions).values({
      userId: newAccount.id,
      clerkId: newAccount.clerkId,
    });

    const input = {
      reservationId: reservation.id,
      fromUserId: oldAccount.id,
      toUserId: newAccount.id,
    };
    expect(await service.previewParticipantTransfer(input)).toMatchObject({
      success: false,
      code: "TRANSFER_TARGET_DELETION_PENDING",
    });
    expect(
      await service.transferReservationParticipation({
        ...input,
        idempotencyKey: randomUUID(),
      }),
    ).toMatchObject({
      success: false,
      code: "TRANSFER_TARGET_DELETION_PENDING",
    });
    const participants = await db
      .select({ userId: reservationParticipants.userId })
      .from(reservationParticipants)
      .where(eq(reservationParticipants.reservationId, reservation.id));
    expect(participants).toEqual([{ userId: oldAccount.id }]);
  });

  it("lets a live reservation reach an account whose own attempts in the festival were rejected or cancelled", async () => {
    const db = integrationDb!;
    const { festival, accounts, standRows } = await seed({
      festivalStatus: "active",
    });
    const [oldAccount, newAccount] = accounts;
    const { reservation } = await seedReservation({
      festivalId: festival.id,
      standId: standRows[0].id,
      ownerUserId: oldAccount.id,
      status: "pending",
    });
    // The new account's own tries, refused because the old one held a stand.
    for (const [index, status] of (
      ["rejected", "cancelled"] as const
    ).entries()) {
      const { reservation: refused } = await seedReservation({
        festivalId: festival.id,
        standId: standRows[index + 1].id,
        ownerUserId: newAccount.id,
        status: "pending",
      });
      await db
        .update(standReservations)
        .set({ status })
        .where(eq(standReservations.id, refused.id));
    }

    const result = await service.transferReservationParticipation({
      reservationId: reservation.id,
      fromUserId: oldAccount.id,
      toUserId: newAccount.id,
      idempotencyKey: randomUUID(),
    });
    expect(result.success).toBe(true);
    const [after] = await db
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, reservation.id));
    expect(after).toMatchObject({
      ownerUserId: newAccount.id,
      status: "pending",
    });

    // What the participant's own pages read, the way the new-reservation
    // pages read it: the live stand is there next to the refused attempts,
    // and a new reservation is still refused, but for the stand they have.
    const memberships = await db.query.reservationParticipants.findMany({
      where: eq(reservationParticipants.userId, newAccount.id),
      with: {
        reservation: {
          columns: { id: true, festivalId: true, status: true, source: true },
        },
      },
    });
    const live = memberships
      .map((row) => row.reservation)
      .filter((row) =>
        ["pending", "verification_payment", "accepted"].includes(row.status),
      );
    expect(live.map((row) => row.id)).toEqual([reservation.id]);
    const { evaluateSelfServiceEligibility, summarizeFestivalParticipations } =
      await import("@/app/lib/reservations/policy");
    const summary = summarizeFestivalParticipations(
      memberships.map((row) => row.reservation),
      festival.id,
    );
    expect(summary).toMatchObject({
      hasRejectedFestivalReservation: true,
      hasLiveFestivalReservation: true,
    });
    expect(
      evaluateSelfServiceEligibility({
        now: new Date(),
        actor: { id: newAccount.id, role: "user" },
        targetProfileId: newAccount.id,
        intent: "view",
        profile: { id: newAccount.id, status: "verified" },
        festival: {
          id: festival.id,
          status: "active",
          reservationsStartDate: new Date(Date.now() - 60_000),
          participantTermsEnabled: true,
        },
        publishedTermsVersionId: 1,
        enrollment: {
          type: "festival_participation",
          status: "accepted",
          termsVersionId: 1,
        },
        sanctionBlocked: false,
        ...summary,
      }),
    ).toEqual({ allowed: false, code: "ALREADY_RESERVED" });
  });

  it("leaves an ownerless reservation's holder in place when a companion's participation moves", async () => {
    const db = integrationDb!;
    // Created in order, so the target has the lowest user id of the three.
    const { festival, accounts, standRows } = await seed({ accounts: 3 });
    const [target, holder, companion] = accounts;
    const [reservation] = await db
      .insert(standReservations)
      .values({
        festivalId: festival.id,
        standId: standRows[0].id,
        status: "accepted",
        source: "legacy_unknown",
        ownerUserId: null,
        bookedParticipantCount: 2,
      })
      .returning();
    await db.insert(standReservationStands).values({
      reservationId: reservation.id,
      standId: standRows[0].id,
      position: 0,
    });
    // The holder's participation was made first.
    await db
      .insert(reservationParticipants)
      .values({ userId: holder.id, reservationId: reservation.id });
    await db
      .insert(reservationParticipants)
      .values({ userId: companion.id, reservationId: reservation.id });

    const result = await service.transferReservationParticipation({
      reservationId: reservation.id,
      fromUserId: companion.id,
      toUserId: target.id,
      idempotencyKey: randomUUID(),
    });
    expect(result.success).toBe(true);

    const [after] = await db
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, reservation.id));
    expect(after.ownerUserId).toBeNull();
    const participants = await db
      .select({
        id: reservationParticipants.id,
        userId: reservationParticipants.userId,
      })
      .from(reservationParticipants)
      .where(eq(reservationParticipants.reservationId, reservation.id));
    const { reservationHolderId } =
      await import("@/app/lib/participations/admin-history");
    expect(
      reservationHolderId({ ownerUserId: null, invoices: [], participants }),
    ).toBe(holder.id);
  });

  describe("credits from the old wallet behind an archived reservation", () => {
    async function spend(
      userId: number,
      amount: number,
      featureActionId?: number,
    ) {
      const [entry] = await integrationDb!
        .insert(creditLedgerEntries)
        .values({
          userId,
          amount: -amount,
          type: "spend",
          featureActionId: featureActionId ?? null,
          idempotencyKey: `transfer-test-spend:${randomUUID()}`,
        })
        .returning();
      return entry;
    }

    it("refuses to move the holding while credits from the old wallet pay its cobro", async () => {
      const db = integrationDb!;
      const { festival, accounts, standRows } = await seed({});
      const [oldAccount, newAccount] = accounts;
      const { reservation, invoice } = await seedReservation({
        festivalId: festival.id,
        standId: standRows[0].id,
        ownerUserId: oldAccount.id,
      });
      const entry = await spend(oldAccount.id, 40);
      await db.insert(invoiceCreditAllocations).values({
        invoiceId: invoice.id,
        userId: oldAccount.id,
        amount: 40,
        ledgerEntryId: entry.id,
        idempotencyKey: `transfer-test-alloc:${randomUUID()}`,
      });

      const input = {
        reservationId: reservation.id,
        fromUserId: oldAccount.id,
        toUserId: newAccount.id,
      };
      expect(await service.previewParticipantTransfer(input)).toMatchObject({
        success: false,
        code: "TRANSFER_CREDITS_APPLIED",
      });
      expect(
        await service.transferReservationParticipation({
          ...input,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: false, code: "TRANSFER_CREDITS_APPLIED" });
      const [unchanged] = await db
        .select()
        .from(standReservations)
        .where(eq(standReservations.id, reservation.id));
      expect(unchanged.ownerUserId).toBe(oldAccount.id);

      // Once the spend is reversed the credits no longer back the cobro.
      await db.insert(creditLedgerEntries).values({
        userId: oldAccount.id,
        amount: -40,
        type: "reversal",
        reversesEntryId: entry.id,
        idempotencyKey: `transfer-test-reversal:${randomUUID()}`,
      });
      expect(await service.previewParticipantTransfer(input)).toMatchObject({
        success: true,
      });
    });

    it("refuses to move the holding while the old wallet's late-partner payment is still behind it", async () => {
      const db = integrationDb!;
      const { festival, accounts, standRows } = await seed({ accounts: 3 });
      const [oldAccount, partner, newAccount] = accounts;
      const { reservation } = await seedReservation({
        festivalId: festival.id,
        standId: standRows[0].id,
        ownerUserId: oldAccount.id,
        participantUserIds: [oldAccount.id, partner.id],
      });
      const [action] = await db
        .insert(reservationFeatureActions)
        .values({
          festivalId: festival.id,
          reservationId: reservation.id,
          ownerUserId: oldAccount.id,
          targetPartnerUserId: partner.id,
          type: "late_partner",
          status: "fulfilled",
          featurePriceSnapshot: 10,
        })
        .returning();
      await db.insert(reservationFeatureActionItems).values({
        featureActionId: action.id,
        kind: "shared_price_difference",
        amount: 50,
      });
      await spend(oldAccount.id, 60, action.id);

      expect(
        await service.previewParticipantTransfer({
          reservationId: reservation.id,
          fromUserId: oldAccount.id,
          toUserId: newAccount.id,
        }),
      ).toMatchObject({ success: false, code: "TRANSFER_CREDITS_APPLIED" });
    });

    it("still moves a companion's participation: the owner, and so every refund, stays put", async () => {
      const db = integrationDb!;
      const { festival, accounts, standRows } = await seed({ accounts: 3 });
      const [holder, oldAccount, newAccount] = accounts;
      const { reservation, invoice } = await seedReservation({
        festivalId: festival.id,
        standId: standRows[0].id,
        ownerUserId: holder.id,
        participantUserIds: [holder.id, oldAccount.id],
      });
      const entry = await spend(holder.id, 40);
      await db.insert(invoiceCreditAllocations).values({
        invoiceId: invoice.id,
        userId: holder.id,
        amount: 40,
        ledgerEntryId: entry.id,
        idempotencyKey: `transfer-test-alloc:${randomUUID()}`,
      });

      const result = await service.transferReservationParticipation({
        reservationId: reservation.id,
        fromUserId: oldAccount.id,
        toUserId: newAccount.id,
        idempotencyKey: randomUUID(),
      });
      expect(result.success).toBe(true);
      const [after] = await db
        .select()
        .from(standReservations)
        .where(eq(standReservations.id, reservation.id));
      expect(after.ownerUserId).toBe(holder.id);
    });
  });

  describe("the payment reminder of an ownerless reservation", () => {
    /**
     * A live legacy reservation with no owner: two participations in the
     * given order and one pending cobro billed to `payerUserId`.
     */
    async function seedOwnerless(input: {
      festivalId: number;
      standId: number;
      participantUserIds: number[];
      payerUserId: number;
    }) {
      const db = integrationDb!;
      const [reservation] = await db
        .insert(standReservations)
        .values({
          festivalId: input.festivalId,
          standId: input.standId,
          status: "pending",
          source: "legacy_unknown",
          ownerUserId: null,
          priceAmountSnapshot: 150,
          individualPriceSnapshot: 100,
          sharedPriceSnapshot: 150,
          bookedParticipantCount: input.participantUserIds.length,
        })
        .returning();
      await db.insert(standReservationStands).values({
        reservationId: reservation.id,
        standId: input.standId,
        position: 0,
      });
      // One at a time, so the row order is the order given.
      for (const userId of input.participantUserIds) {
        await db
          .insert(reservationParticipants)
          .values({ userId, reservationId: reservation.id });
      }
      await db.insert(invoices).values({
        date: new Date(),
        userId: input.payerUserId,
        reservationId: reservation.id,
        originalAmount: 150,
        amount: 150,
        status: "pending",
      });
      return reservation;
    }

    async function extendAndReadReminder(reservationId: number) {
      const { extendReservationPaymentDeadline } =
        await import("@/app/lib/reservations/admin-service");
      const result = await extendReservationPaymentDeadline({
        reservationId,
        dueAt: new Date(Date.now() + 10 * 86_400_000),
      });
      expect(result).toMatchObject({ success: true });
      return integrationDb!
        .select({ profileId: scheduledTasks.profileId })
        .from(scheduledTasks)
        .where(eq(scheduledTasks.reservationId, reservationId));
    }

    it("goes to the live cobro's payer, not to whichever participation a scan returns first", async () => {
      const { festival, accounts, standRows } = await seed({
        festivalStatus: "active",
      });
      const [companion, payer] = accounts;
      const reservation = await seedOwnerless({
        festivalId: festival.id,
        standId: standRows[0].id,
        // The companion's participation was made first.
        participantUserIds: [companion.id, payer.id],
        payerUserId: payer.id,
      });

      expect(await extendAndReadReminder(reservation.id)).toEqual([
        { profileId: payer.id },
      ]);
    });

    it("stays with the holder after a companion's participation moves to an account with a lower id", async () => {
      const db = integrationDb!;
      // Created in order: the target has the lowest user id.
      const { festival, accounts, standRows } = await seed({
        festivalStatus: "active",
        accounts: 3,
      });
      const [target, holder, companion] = accounts;
      const reservation = await seedOwnerless({
        festivalId: festival.id,
        standId: standRows[0].id,
        participantUserIds: [holder.id, companion.id],
        payerUserId: holder.id,
      });

      const transfer = await service.transferReservationParticipation({
        reservationId: reservation.id,
        fromUserId: companion.id,
        toUserId: target.id,
        idempotencyKey: randomUUID(),
      });
      expect(transfer.success).toBe(true);
      const [after] = await db
        .select({ ownerUserId: standReservations.ownerUserId })
        .from(standReservations)
        .where(eq(standReservations.id, reservation.id));
      expect(after.ownerUserId).toBeNull();

      expect(await extendAndReadReminder(reservation.id)).toEqual([
        { profileId: holder.id },
      ]);
    });
  });
});
