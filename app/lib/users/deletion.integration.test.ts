// @vitest-environment node

import { randomUUID } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
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
  festivalSectors,
  festivals,
  invoiceSettlementSubmissions,
  invoices,
  payments,
  pendingUserDeletions,
  pushSubscriptions,
  reservationFeatureActions,
  reservationParticipants,
  reservationRequestRegistry,
  standReservationEvents,
  standReservationStands,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";

type Viewer = { id: number; role: string; status: string };
const state = vi.hoisted(() => ({ viewer: null as Viewer | null }));
const deleteClerkUser = vi.hoisted(() => vi.fn());
const clerkLoginStatus = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/users/clerk", () => ({ deleteClerkUser, clerkLoginStatus }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => state.viewer,
  getCurrentBaseProfile: async () => state.viewer,
  requireAdmin: async () =>
    state.viewer?.role === "admin" ? state.viewer : null,
  requireAdminOrFestivalAdmin: async () =>
    state.viewer?.role === "admin" || state.viewer?.role === "festival_admin"
      ? state.viewer
      : null,
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

const fixtures: {
  festivalId: number;
  userIds: number[];
  clerkIds: string[];
}[] = [];

let userActions: typeof import("@/app/api/users/actions");
let transfers: typeof import("@/app/lib/reservations/participant-transfer-service");
let blockers: typeof import("@/app/lib/users/deletion-blockers");

const NO_STATE = { success: false, message: "" };

describeDatabase("deleting a profile", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    userActions = await import("@/app/api/users/actions");
    transfers =
      await import("@/app/lib/reservations/participant-transfer-service");
    blockers = await import("@/app/lib/users/deletion-blockers");
  }, 60_000);

  afterEach(async () => {
    deleteClerkUser.mockReset();
    clerkLoginStatus.mockReset();
    state.viewer = null;
    const db = integrationDb!;
    for (const fixture of fixtures.splice(0)) {
      const reservationIds = (
        await db
          .select({ id: standReservations.id })
          .from(standReservations)
          .where(eq(standReservations.festivalId, fixture.festivalId))
      ).map((row) => row.id);
      if (reservationIds.length > 0) {
        // Payments and proofs cascade from their invoice.
        await db
          .delete(invoices)
          .where(inArray(invoices.reservationId, reservationIds));
        await db
          .delete(standReservationEvents)
          .where(inArray(standReservationEvents.reservationId, reservationIds));
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
      await db
        .delete(reservationFeatureActions)
        .where(eq(reservationFeatureActions.festivalId, fixture.festivalId));
      await db.delete(stands).where(eq(stands.festivalId, fixture.festivalId));
      await db
        .delete(festivalSectors)
        .where(eq(festivalSectors.festivalId, fixture.festivalId));
      await db
        .delete(reservationRequestRegistry)
        .where(
          inArray(reservationRequestRegistry.actorUserId, fixture.userIds),
        );
      // Keyed by Clerk id: a finished deletion has already nulled user_id.
      await db
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.clerkId, fixture.clerkIds));
      await db
        .delete(userRequests)
        .where(inArray(userRequests.userId, fixture.userIds));
      await db.delete(users).where(inArray(users.id, fixture.userIds));
      await db.delete(festivals).where(eq(festivals.id, fixture.festivalId));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  /**
   * A participant who reserved and paid through the app from an old account,
   * which is what leaves request-log rows behind, plus the new account they
   * use now.
   */
  async function seed() {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Deletion ${suffix}`,
        status: "archived",
        festivalType: "glitter",
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();
    const [admin, oldAccount, newAccount] = await db
      .insert(users)
      .values(
        (["admin", "old", "new"] as const).map((name) => ({
          clerkId: `del-${name}-${suffix}`,
          email: `del-${name}-${suffix}@example.test`,
          displayName: `Del ${name} ${suffix}`,
          status: "verified" as const,
          role: name === "admin" ? ("admin" as const) : ("user" as const),
          category: "illustration" as const,
        })),
      )
      .returning();
    fixtures.push({
      festivalId: festival.id,
      userIds: [admin.id, oldAccount.id, newAccount.id],
      clerkIds: [admin.clerkId, oldAccount.clerkId, newAccount.clerkId],
    });

    const [sector] = await db
      .insert(festivalSectors)
      .values({
        name: `S ${suffix}`,
        festivalId: festival.id,
        orderInFestival: 1,
      })
      .returning();
    const [stand] = await db
      .insert(stands)
      .values({
        festivalId: festival.id,
        festivalSectorId: sector.id,
        standNumber: 1,
        standCategory: "illustration",
        status: "confirmed",
        price: 100,
        individualPrice: 100,
      })
      .returning();
    const [reservation] = await db
      .insert(standReservations)
      .values({
        festivalId: festival.id,
        standId: stand.id,
        status: "accepted",
        source: "user_reservation",
        ownerUserId: oldAccount.id,
        priceAmountSnapshot: 100,
        individualPriceSnapshot: 100,
      })
      .returning();
    await db.insert(standReservationStands).values({
      reservationId: reservation.id,
      standId: stand.id,
      position: 0,
    });
    await db
      .insert(reservationParticipants)
      .values({ userId: oldAccount.id, reservationId: reservation.id });
    await db.insert(userRequests).values({
      userId: oldAccount.id,
      festivalId: festival.id,
      type: "festival_participation",
      status: "accepted",
    });
    const [invoice] = await db
      .insert(invoices)
      .values({
        date: new Date(),
        userId: oldAccount.id,
        reservationId: reservation.id,
        originalAmount: 100,
        amount: 100,
        status: "paid",
      })
      .returning();
    const [payment] = await db
      .insert(payments)
      .values({
        amount: 100,
        date: new Date(),
        invoiceId: invoice.id,
        voucherUrl: "https://example.test/voucher.png",
        uploadedByUserId: oldAccount.id,
      })
      .returning();
    const [submission] = await db
      .insert(invoiceSettlementSubmissions)
      .values({
        invoiceId: invoice.id,
        paymentId: payment.id,
        voucherUrl: payment.voucherUrl,
        uploadedByUserId: oldAccount.id,
        status: "approved",
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
      })
      .returning();
    await db.insert(reservationRequestRegistry).values({
      requestKey: randomUUID(),
      operation: "submitPaymentProof",
      actorUserId: oldAccount.id,
      scope: { invoiceId: invoice.id },
      status: "completed",
      resultIds: { paymentId: payment.id },
    });

    state.viewer = { id: admin.id, role: "admin", status: "verified" };
    deleteClerkUser.mockResolvedValue({ status: "deleted" });
    return {
      festival,
      admin,
      oldAccount,
      newAccount,
      reservation,
      invoice,
      payment,
      submission,
    };
  }

  async function userExists(id: number) {
    const rows = await integrationDb!
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id));
    return rows.length > 0;
  }

  it("refuses while the account still has a participation, before Clerk is touched", async () => {
    const { oldAccount } = await seed();

    expect(await userActions.deleteProfile(oldAccount.id, NO_STATE)).toEqual({
      success: false,
      message: blockers.PROFILE_DELETION_BLOCK_MESSAGES.participations,
    });
    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(await userExists(oldAccount.id)).toBe(true);
    const pending = await integrationDb!
      .select({ id: pendingUserDeletions.id })
      .from(pendingUserDeletions)
      .where(eq(pendingUserDeletions.userId, oldAccount.id));
    expect(pending).toEqual([]);
  });

  it("deletes the old account once its participation moved, and the payment stays on the cobro", async () => {
    const db = integrationDb!;
    const f = await seed();
    const transfer = await transfers.transferReservationParticipation({
      reservationId: f.reservation.id,
      fromUserId: f.oldAccount.id,
      toUserId: f.newAccount.id,
      idempotencyKey: randomUUID(),
    });
    expect(transfer.success).toBe(true);

    expect(await userActions.deleteProfile(f.oldAccount.id, NO_STATE)).toEqual({
      success: true,
      message: "Perfil eliminado",
    });
    expect(deleteClerkUser).toHaveBeenCalledWith(f.oldAccount.clerkId);
    expect(await userExists(f.oldAccount.id)).toBe(false);

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, f.invoice.id));
    expect(invoice).toMatchObject({
      userId: f.newAccount.id,
      status: "paid",
      amount: 100,
    });
    // The money stays where it was paid; only who uploaded it is forgotten.
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, f.payment.id));
    expect(payment).toMatchObject({
      invoiceId: f.invoice.id,
      amount: 100,
      uploadedByUserId: null,
    });
    const [submission] = await db
      .select()
      .from(invoiceSettlementSubmissions)
      .where(eq(invoiceSettlementSubmissions.id, f.submission.id));
    expect(submission).toMatchObject({
      status: "approved",
      uploadedByUserId: null,
      reviewedByUserId: f.admin.id,
    });
    const [reservation] = await db
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, f.reservation.id));
    expect(reservation).toMatchObject({
      ownerUserId: f.newAccount.id,
      status: "accepted",
    });
    // The transfer's own event survives; it was recorded by the admin.
    const events = await db
      .select({ actorUserId: standReservationEvents.actorUserId })
      .from(standReservationEvents)
      .where(eq(standReservationEvents.reservationId, f.reservation.id));
    expect(events).toEqual([{ actorUserId: f.admin.id }]);
    const leftovers = await db
      .select({ key: reservationRequestRegistry.requestKey })
      .from(reservationRequestRegistry)
      .where(eq(reservationRequestRegistry.actorUserId, f.oldAccount.id));
    expect(leftovers).toEqual([]);
  });

  it("refuses an account with credit history before Clerk is touched", async () => {
    const f = await seed();
    await transfers.transferReservationParticipation({
      reservationId: f.reservation.id,
      fromUserId: f.oldAccount.id,
      toUserId: f.newAccount.id,
      idempotencyKey: randomUUID(),
    });
    // A paid feature bought from the old wallet: kept with the credit history.
    await integrationDb!.insert(reservationFeatureActions).values({
      festivalId: f.festival.id,
      ownerUserId: f.oldAccount.id,
      type: "late_partner",
      status: "cancelled",
      featurePriceSnapshot: 20,
    });

    expect(await userActions.deleteProfile(f.oldAccount.id, NO_STATE)).toEqual({
      success: false,
      message: blockers.PROFILE_DELETION_BLOCK_MESSAGES.credit_history,
    });
    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(await userExists(f.oldAccount.id)).toBe(true);
  });

  it("finishes a deletion that stalled after Clerk on the request log", async () => {
    const f = await seed();
    await transfers.transferReservationParticipation({
      reservationId: f.reservation.id,
      fromUserId: f.oldAccount.id,
      toUserId: f.newAccount.id,
      idempotencyKey: randomUUID(),
    });
    // What the old flow left behind: the login gone, the local delete refused
    // by the account's request-log rows.
    await integrationDb!.insert(pendingUserDeletions).values({
      userId: f.oldAccount.id,
      clerkId: f.oldAccount.clerkId,
      clerkDeletedAt: new Date(),
      lastError:
        "PERMANENT: violates foreign key constraint reservation_request_registry_actor_user_id_users_id_fk",
    });

    expect(await userActions.deleteProfile(f.oldAccount.id, NO_STATE)).toEqual({
      success: true,
      message: "Perfil eliminado",
    });
    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(await userExists(f.oldAccount.id)).toBe(false);
  });

  it("holds the account while Clerk answers, so a blocker written then waits and fails", async () => {
    const f = await seed();
    await transfers.transferReservationParticipation({
      reservationId: f.reservation.id,
      fromUserId: f.oldAccount.id,
      toUserId: f.newAccount.id,
      idempotencyKey: randomUUID(),
    });

    // Clerk answers only when the test says so.
    let answerClerk!: (value: { status: "deleted" }) => void;
    deleteClerkUser.mockReset();
    deleteClerkUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          answerClerk = resolve;
        }),
    );
    const deletion = userActions.deleteProfile(f.oldAccount.id, NO_STATE);
    await vi.waitFor(() => expect(deleteClerkUser).toHaveBeenCalled(), {
      timeout: 5_000,
    });

    // At that moment an admin puts the account back on a reservation, and a
    // cobro is billed to it: the two writes the participations check guards.
    const writers = [await pool!.connect(), await pool!.connect()];
    const settled = [false, false];
    try {
      const writes = [
        writers[0].query(
          "INSERT INTO participations (user_id, reservation_id) VALUES ($1, $2)",
          [f.oldAccount.id, f.reservation.id],
        ),
        writers[1].query(
          `INSERT INTO invoices (user_id, reservation_id, amount, original_amount, date)
           VALUES ($1, $2, 50, 50, now())`,
          [f.oldAccount.id, f.reservation.id],
        ),
      ].map((write, index) =>
        write.finally(() => {
          settled[index] = true;
        }),
      );
      writes.forEach((write) => write.catch(() => {}));
      await new Promise((resolve) => setTimeout(resolve, 750));
      expect(settled).toEqual([false, false]);

      answerClerk({ status: "deleted" });
      expect(await deletion).toEqual({
        success: true,
        message: "Perfil eliminado",
      });
      for (const write of writes) {
        await expect(write).rejects.toMatchObject({ code: "23503" });
      }
    } finally {
      writers.forEach((writer) => writer.release());
    }
    expect(await userExists(f.oldAccount.id)).toBe(false);
  });

  async function activePending(clerkId: string) {
    return integrationDb!
      .select()
      .from(pendingUserDeletions)
      .where(
        and(
          eq(pendingUserDeletions.clerkId, clerkId),
          isNull(pendingUserDeletions.localDeletedAt),
        ),
      );
  }

  async function transferAway(f: Awaited<ReturnType<typeof seed>>) {
    await transfers.transferReservationParticipation({
      reservationId: f.reservation.id,
      fromUserId: f.oldAccount.id,
      toUserId: f.newAccount.id,
      idempotencyKey: randomUUID(),
    });
  }

  it("gives the account back when Clerk confirms the login is still there", async () => {
    const f = await seed();
    await transferAway(f);
    deleteClerkUser.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "Clerk no respondió",
    });
    clerkLoginStatus.mockResolvedValue("exists");

    expect(await userActions.deleteProfile(f.oldAccount.id, NO_STATE)).toEqual({
      success: false,
      message:
        "No se pudo eliminar la cuenta de acceso. El perfil quedó como estaba; volvé a intentar.",
    });
    expect(await userExists(f.oldAccount.id)).toBe(true);
    // Nothing keeps treating it as being deleted: credits, notices and push
    // all read an active pending row as "deletion under way".
    expect(await activePending(f.oldAccount.clerkId)).toEqual([]);
  });

  it("finishes the deletion when a failed Clerk call had in fact removed the login", async () => {
    const f = await seed();
    await transferAway(f);
    deleteClerkUser.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "connection reset",
    });
    clerkLoginStatus.mockResolvedValue("gone");

    expect(await userActions.deleteProfile(f.oldAccount.id, NO_STATE)).toEqual({
      success: true,
      message: "Perfil eliminado",
    });
    expect(await userExists(f.oldAccount.id)).toBe(false);
  });

  it("keeps the deletion pending when Clerk cannot say, and finishes it on the next try", async () => {
    const f = await seed();
    await transferAway(f);
    deleteClerkUser.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "Clerk 503",
    });
    clerkLoginStatus.mockResolvedValue("unknown");

    expect(await userActions.deleteProfile(f.oldAccount.id, NO_STATE)).toEqual({
      success: false,
      message:
        "No pudimos confirmar si se eliminó la cuenta de acceso. Volvé a intentar en unos minutos.",
    });
    expect(await userExists(f.oldAccount.id)).toBe(true);
    const [pending] = await activePending(f.oldAccount.clerkId);
    expect(pending).toMatchObject({
      clerkDeletedAt: null,
      lastError: "clerk_delete_failed: Clerk 503",
    });

    deleteClerkUser.mockResolvedValue({
      success: true,
      status: "already_deleted",
      message: "Usuario no encontrado",
    });
    expect(await userActions.deleteProfile(f.oldAccount.id, NO_STATE)).toEqual({
      success: true,
      message: "Perfil eliminado",
    });
    expect(await userExists(f.oldAccount.id)).toBe(false);
  });

  it("keeps an earlier unconfirmed request on record when the retry gets a definite no", async () => {
    const f = await seed();
    await transferAway(f);
    const earlier = new Date(Date.now() - 20_000);
    await integrationDb!.insert(pendingUserDeletions).values({
      userId: f.oldAccount.id,
      clerkId: f.oldAccount.clerkId,
      clerkAttemptedAt: earlier,
      lastError: "clerk_delete_failed: timed out",
    });
    // This request is refused and the login is there now, but that settles
    // only this request: the one sent 20s ago may still land.
    deleteClerkUser.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "Clerk 429",
    });
    clerkLoginStatus.mockResolvedValue("exists");

    expect(await userActions.deleteProfile(f.oldAccount.id, NO_STATE)).toEqual({
      success: false,
      message:
        "No pudimos confirmar si se eliminó la cuenta de acceso. Volvé a intentar en unos minutos.",
    });
    const [pending] = await activePending(f.oldAccount.clerkId);
    expect(pending.clerkAttemptedAt?.getTime()).toBe(earlier.getTime());
    expect(await userExists(f.oldAccount.id)).toBe(true);
  });

  it("reports a deletion another attempt finished as done, not as a lost login", async () => {
    const db = integrationDb!;
    const f = await seed();
    const [pending] = await db
      .insert(pendingUserDeletions)
      .values({
        userId: f.oldAccount.id,
        clerkId: f.oldAccount.clerkId,
        clerkDeletedAt: new Date(),
        localDeletedAt: new Date(),
      })
      .returning({ id: pendingUserDeletions.id });

    const core = await import("@/app/lib/users/profile-deletion");
    expect(
      await core.releaseRefusedDeletion({
        profileId: f.oldAccount.id,
        pendingId: pending.id,
        clerkId: f.oldAccount.clerkId,
        clerkBudgetMs: 1_000,
      }),
    ).toBe("deleted");
    expect(clerkLoginStatus).not.toHaveBeenCalled();
  });

  describe("a retry refused for a blocker added since the last try", () => {
    // The account still holds its participation. `attemptedAgoMs` puts an
    // earlier Clerk request whose outcome was never confirmed on the row.
    async function seedRetried(attemptedAgoMs: number | null) {
      const f = await seed();
      await integrationDb!.insert(pendingUserDeletions).values({
        userId: f.oldAccount.id,
        clerkId: f.oldAccount.clerkId,
        clerkAttemptedAt:
          attemptedAgoMs == null ? null : new Date(Date.now() - attemptedAgoMs),
        lastError: "clerk_delete_failed: timed out",
      });
      return f;
    }

    const participations = () =>
      blockers.PROFILE_DELETION_BLOCK_MESSAGES.participations;

    it("releases the account at once when no Clerk request was ever sent", async () => {
      const f = await seedRetried(null);

      expect(
        await userActions.deleteProfile(f.oldAccount.id, NO_STATE),
      ).toEqual({ success: false, message: participations() });
      expect(clerkLoginStatus).not.toHaveBeenCalled();
      expect(deleteClerkUser).not.toHaveBeenCalled();
      expect(await activePending(f.oldAccount.clerkId)).toEqual([]);
    });

    it("keeps it pending while a recent unconfirmed request could still land", async () => {
      const f = await seedRetried(30_000);
      // The login is still there now, but the request that timed out may
      // reach Clerk afterwards: releasing would strand the profile unseen.
      clerkLoginStatus.mockResolvedValue("exists");

      expect(
        await userActions.deleteProfile(f.oldAccount.id, NO_STATE),
      ).toEqual({
        success: false,
        message: `${participations()} No pudimos confirmar si su cuenta de acceso sigue activa: volvé a intentar en unos minutos.`,
      });
      expect(await activePending(f.oldAccount.clerkId)).toHaveLength(1);
    });

    it("releases it once the unconfirmed request is too old to land", async () => {
      const f = await seedRetried(10 * 60_000);
      clerkLoginStatus.mockResolvedValue("exists");

      expect(
        await userActions.deleteProfile(f.oldAccount.id, NO_STATE),
      ).toEqual({ success: false, message: participations() });
      expect(await activePending(f.oldAccount.clerkId)).toEqual([]);
    });

    it("says the profile has no login left when the earlier try had removed it", async () => {
      const f = await seedRetried(30_000);
      clerkLoginStatus.mockResolvedValue("gone");

      expect(
        await userActions.deleteProfile(f.oldAccount.id, NO_STATE),
      ).toEqual({
        success: false,
        message: `${participations()} Su cuenta de acceso ya fue eliminada, así que esta persona ya no puede iniciar sesión con ella.`,
      });
      expect(await userExists(f.oldAccount.id)).toBe(true);
      const [pending] = await activePending(f.oldAccount.clerkId);
      expect(pending.clerkDeletedAt).not.toBeNull();
    });
  });

  it("keeps the push devices of an account whose deletion does not go ahead", async () => {
    const f = await seed();
    await transferAway(f);
    await integrationDb!.insert(pushSubscriptions).values({
      userId: f.oldAccount.id,
      endpoint: `https://push.example.test/${randomUUID()}`,
      p256dh: "key",
      auth: "auth",
      applicationServerKey: "server-key",
    });
    // Past every check, then stopped at Clerk with the login still there:
    // the devices used to go when the deletion was claimed.
    deleteClerkUser.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "Clerk 500",
    });
    clerkLoginStatus.mockResolvedValue("exists");

    try {
      expect(
        (await userActions.deleteProfile(f.oldAccount.id, NO_STATE)).success,
      ).toBe(false);
      const devices = await integrationDb!
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, f.oldAccount.id));
      expect(devices).toHaveLength(1);
    } finally {
      await integrationDb!
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, f.oldAccount.id));
    }
  });

  it("tells the admin the login is gone when the local delete fails after it", async () => {
    const f = await seed();
    await transferAway(f);
    deleteClerkUser.mockResolvedValue({ success: true, status: "deleted" });
    // A failure in the local delete after Clerk has removed the login.
    const scrub = await import("@/app/lib/notifications/scrub");
    const spy = vi
      .spyOn(scrub, "scrubNotificationsNamingUser")
      .mockRejectedValueOnce(new Error("scrub failed"));

    try {
      expect(
        await userActions.deleteProfile(f.oldAccount.id, NO_STATE),
      ).toEqual({
        success: false,
        message:
          "La cuenta de acceso ya fue eliminada, pero el perfil no se pudo borrar. Volvé a intentar; si se repite, revisá el registro de errores.",
      });
    } finally {
      spy.mockRestore();
    }
    expect(await userExists(f.oldAccount.id)).toBe(true);
    // Recorded although the transaction rolled back, so the retry finishes
    // without asking Clerk again.
    const [pending] = await activePending(f.oldAccount.clerkId);
    expect(pending.clerkDeletedAt).not.toBeNull();

    deleteClerkUser.mockClear();
    expect(await userActions.deleteProfile(f.oldAccount.id, NO_STATE)).toEqual({
      success: true,
      message: "Perfil eliminado",
    });
    expect(deleteClerkUser).not.toHaveBeenCalled();
  });

  it("stops without calling Clerk when another attempt already released the pending row", async () => {
    const db = integrationDb!;
    const f = await seed();
    await transferAway(f);
    const [pending] = await db
      .insert(pendingUserDeletions)
      .values({ userId: f.oldAccount.id, clerkId: f.oldAccount.clerkId })
      .returning({ id: pendingUserDeletions.id });
    // Released by a concurrent refusal before this attempt took the lock.
    await db
      .delete(pendingUserDeletions)
      .where(eq(pendingUserDeletions.id, pending.id));

    const core = await import("@/app/lib/users/profile-deletion");
    expect(
      await core.finalizeProfileDeletion({
        profileId: f.oldAccount.id,
        pendingId: pending.id,
        clerkId: f.oldAccount.clerkId,
        clerkBudgetMs: 1_000,
      }),
    ).toEqual({ kind: "conflict" });
    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(await userExists(f.oldAccount.id)).toBe(true);
  });

  it("accounts for every reference to users that refuses a delete", async () => {
    const { rows } = await pool!.query<{ reference: string }>(`
      SELECT c.conrelid::regclass::text || '.' || a.attname AS reference
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.confrelid = 'users'::regclass
        AND c.confdeltype IN ('a', 'r')
    `);
    // A new RESTRICT reference must be checked before Clerk is touched or
    // cleared in the delete; otherwise the login goes and the row stays.
    expect(rows.map((row) => row.reference).sort()).toEqual(
      Object.keys(blockers.GUARDED_USER_REFERENCES).sort(),
    );
  });
});
