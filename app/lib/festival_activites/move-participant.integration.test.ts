// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
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
  vi,
} from "vitest";

import type { BaseProfile } from "@/app/api/users/definitions";
import type {
  MoveParticipantOptions,
  MoveParticipantResult,
} from "@/app/lib/festival_activites/admin-actions";
import type {
  ActivityDetailsWithParticipants,
  FestivalActivity,
} from "@/app/lib/festivals/definitions";
import * as schema from "@/db/schema";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipantProofs,
  festivalActivityParticipants,
  festivalActivityVotes,
  festivalActivityWaitlist,
  festivals,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

/**
 * Staff move a participant between variants of one activity. The
 * participation keeps its id and proofs, the target must have room and accept
 * the participant's category, and the freed source slot goes to the waitlist.
 */

const { currentProfile, sendEmail } = vi.hoisted(() => ({
  currentProfile: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail }));
vi.mock("@/app/emails/activity-waitlist-invitation", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/app/emails/activity-proof-review", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/app/emails/festival-activity-registration", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/app/lib/festivals/actions", () => ({
  fetchBaseFestival: vi.fn(async () => null),
}));
vi.mock("@/app/lib/users/queries", () => ({
  fetchAdminUsers: vi.fn(async () => []),
}));
vi.mock("@/app/lib/uploadthing/storage", () => ({
  attemptStorageCleanupJob: vi.fn(),
  enqueueStorageCleanupJob: vi.fn(),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfile,
  requireAdminOrFestivalAdmin: vi.fn(),
  requireProfileOwnerOrAdmin: vi.fn(),
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
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;

type AdminActions = typeof import("@/app/lib/festival_activites/admin-actions");
type Actions = typeof import("@/app/lib/festival_activites/actions");
let moveActivityParticipant: AdminActions["moveActivityParticipant"];
let restoreActivityParticipant: AdminActions["restoreActivityParticipant"];
let promoteWaitlistToVariant: AdminActions["promoteWaitlistToVariant"];
let retryWaitlistInvitation: AdminActions["retryWaitlistInvitation"];
let notifyWaitlistEntry: AdminActions["notifyWaitlistEntry"];
let enrollInActivity: Actions["enrollInActivity"];
let enrollFromWaitlistInvitation: Actions["enrollFromWaitlistInvitation"];
let addFestivalActivityVote: Actions["addFestivalActivityVote"];

type UserRow = typeof users.$inferSelect;

const STALE_MESSAGE =
  "El participante ya fue movido a otra variante. Actualizá la página.";
const FULL_MESSAGE = "La variante de destino no tiene cupos disponibles";

const festivalIds: number[] = [];
const userIds: number[] = [];
const standIds: number[] = [];

/** The undo of `move`, as the menu's Deshacer sends it. */
function undoOf(move: MoveParticipantResult): MoveParticipantOptions["undo"] {
  expect(move.success).toBe(true);
  return { revision: move.revision!, maxActive: move.sourceActiveCount! };
}

async function activeIn(detailsId: number) {
  const rows = await integrationDb!
    .select()
    .from(festivalActivityParticipants)
    .where(eq(festivalActivityParticipants.detailsId, detailsId));
  return rows.filter((row) => row.removedAt === null).length;
}

const variantLock = (detailId: number) => ({
  text: "select id from festival_activity_details where id = $1 for update",
  values: [detailId],
});

/**
 * Starts `race` while its own transaction holds `lock`, and lets go only once
 * `waiters` connections queue behind it. Each racer then counts after the
 * others had their chance to write, instead of only when timing happens to
 * line them up, so a writer that skips the lock fails every run.
 * `beforeRelease` writes in the holding transaction, as a concurrent writer
 * would.
 */
async function behindLock<T>(
  lock: { text: string; values: unknown[] },
  waiters: number,
  race: () => Promise<T>[],
  beforeRelease?: (client: PoolClient) => Promise<unknown>,
): Promise<T[]> {
  const client = await pool!.connect();
  let pending: Promise<T[]> | undefined;
  try {
    await client.query("begin");
    await client.query(lock.text, lock.values);
    const {
      rows: [{ pid }],
    } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
    pending = Promise.all(race());
    pending.catch(() => undefined);
    const deadline = Date.now() + 5_000;
    for (;;) {
      const {
        rows: [{ queued }],
      } = await pool!.query<{ queued: number }>(
        // A second waiter on a row queues behind the first, not the holder.
        `with recursive queued(pid) as (
           select pid from pg_stat_activity where $1 = any(pg_blocking_pids(pid))
           union
           select a.pid from pg_stat_activity a
           join queued q on q.pid = any(pg_blocking_pids(a.pid))
         )
         select count(*)::int as queued from queued`,
        [pid],
      );
      if (queued >= waiters) break;
      if (Date.now() > deadline) {
        throw new Error(`Only ${queued} of ${waiters} writers waited`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await beforeRelease?.(client);
    await client.query("commit");
    return await pending;
  } catch (error) {
    await client.query("rollback");
    // Let the racers finish before the fixtures are cleaned up.
    await pending?.catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const emailRejected = {
  data: null,
  error: { name: "application_error", message: "down", statusCode: 500 },
  headers: null,
};

async function createUser(
  label: string,
  options: {
    role?: "user" | "admin";
    category?: "illustration" | "gastronomy";
  } = {},
): Promise<UserRow> {
  const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `move-participant-${suffix}`,
      email: `move-participant-${suffix}@example.test`,
      displayName: label,
      role: options.role ?? "user",
      status: "verified",
      category: options.category ?? "illustration",
    })
    .returning();
  userIds.push(user.id);
  return user;
}

async function createVariant(
  activityId: number,
  participationLimit: number | null,
  category: "illustration" | "gastronomy" | null = null,
) {
  const [variant] = await integrationDb!
    .insert(festivalActivityDetails)
    .values({ activityId, participationLimit, category })
    .returning({ id: festivalActivityDetails.id });
  return variant.id;
}

async function enroll(detailsId: number, userId: number, removed = false) {
  const [row] = await integrationDb!
    .insert(festivalActivityParticipants)
    .values({
      detailsId,
      userId,
      ...(removed ? { removedAt: new Date(), removalReason: "x" } : {}),
    })
    .returning();
  return row;
}

async function participation(id: number) {
  const [row] = await integrationDb!
    .select()
    .from(festivalActivityParticipants)
    .where(eq(festivalActivityParticipants.id, id));
  return row;
}

let fixture: {
  festivalId: number;
  activityId: number;
  source: number;
  target: number;
  admin: UserRow;
  participant: UserRow;
};

describeDatabase("moving a participant between variants", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({
      moveActivityParticipant,
      restoreActivityParticipant,
      promoteWaitlistToVariant,
      retryWaitlistInvitation,
      notifyWaitlistEntry,
    } = await import("@/app/lib/festival_activites/admin-actions"));
    ({
      enrollInActivity,
      enrollFromWaitlistInvitation,
      addFestivalActivityVote,
    } = await import("@/app/lib/festival_activites/actions"));
  }, 60_000);

  beforeEach(async () => {
    sendEmail.mockResolvedValue({
      data: { id: "email-1" },
      error: null,
      headers: null,
    });

    const [festival] = await integrationDb!
      .insert(festivals)
      .values({
        name: `Move participant ${Date.now()}`,
        status: "active",
        festivalType: "glitter",
      })
      .returning({ id: festivals.id });
    festivalIds.push(festival.id);

    const now = Date.now();
    const [activity] = await integrationDb!
      .insert(festivalActivities)
      .values({
        festivalId: festival.id,
        name: "Cuponera",
        type: "coupon_book",
        registrationStartDate: new Date(now - DAY),
        registrationEndDate: new Date(now + DAY),
        waitlistWindowMinutes: 60,
      })
      .returning({ id: festivalActivities.id });

    const admin = await createUser("admin", { role: "admin" });
    currentProfile.mockResolvedValue(admin);

    fixture = {
      festivalId: festival.id,
      activityId: activity.id,
      source: await createVariant(activity.id, 1),
      target: await createVariant(activity.id, 2),
      admin,
      participant: await createUser("participant"),
    };
  });

  afterEach(async () => {
    vi.clearAllMocks();
    const leftoverStands = standIds.splice(0);
    if (leftoverStands.length > 0) {
      await integrationDb!
        .delete(standReservations)
        .where(inArray(standReservations.standId, leftoverStands));
      await integrationDb!
        .delete(stands)
        .where(inArray(stands.id, leftoverStands));
    }
    const leftoverFestivals = festivalIds.splice(0);
    if (leftoverFestivals.length > 0) {
      await integrationDb!
        .delete(festivals)
        .where(inArray(festivals.id, leftoverFestivals));
    }
    const leftoverUsers = userIds.splice(0);
    if (leftoverUsers.length > 0) {
      await integrationDb!
        .delete(users)
        .where(inArray(users.id, leftoverUsers));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("moves the participation and keeps its proofs", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    await integrationDb!.insert(festivalActivityParticipantProofs).values({
      participationId: row.id,
      proofStatus: "approved",
      promoDescription: "10% de descuento",
    });

    const result = await moveActivityParticipant(row.id, target);

    const moved = await participation(row.id);
    expect(result).toEqual({
      success: true,
      message: "Participante movido de variante",
      revision: moved.updatedAt.toISOString(),
      sourceActiveCount: 0,
    });
    expect(moved.detailsId).toBe(target);
    const proofs = await integrationDb!
      .select()
      .from(festivalActivityParticipantProofs)
      .where(eq(festivalActivityParticipantProofs.participationId, row.id));
    expect(proofs).toHaveLength(1);
    expect(proofs[0].proofStatus).toBe("approved");
  });

  it("invites the next waitlisted profile to the freed slot", async () => {
    const { activityId, source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const waiting = await createUser("waiting");
    const [entry] = await integrationDb!
      .insert(festivalActivityWaitlist)
      .values({ activityId, userId: waiting.id, position: 1 })
      .returning();

    const result = await moveActivityParticipant(row.id, target);

    expect(result.invitedName).toBe("waiting");
    const [invited] = await integrationDb!
      .select()
      .from(festivalActivityWaitlist)
      .where(eq(festivalActivityWaitlist.id, entry.id));
    expect(invited.notifiedForDetailId).toBe(source);
  });

  it("invites nobody when the source variant is still full after the move", async () => {
    const { activityId, source, target, participant } = fixture;
    // Source limit is 1 and holds 2: over capacity, as staff can leave it.
    const row = await enroll(source, participant.id);
    await enroll(source, (await createUser("extra")).id);
    const waiting = await createUser("waiting");
    const [entry] = await integrationDb!
      .insert(festivalActivityWaitlist)
      .values({ activityId, userId: waiting.id, position: 1 })
      .returning();

    const result = await moveActivityParticipant(row.id, target);

    expect(result.success).toBe(true);
    expect(result.invitedName).toBeUndefined();
    const [untouched] = await integrationDb!
      .select()
      .from(festivalActivityWaitlist)
      .where(eq(festivalActivityWaitlist.id, entry.id));
    expect(untouched.notifiedAt).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("undoes a move back into an over-capacity variant, without inviting", async () => {
    const { activityId, source, target, participant } = fixture;
    // Source limit is 1 and holds 2: over capacity, as staff can leave it.
    const row = await enroll(source, participant.id);
    await enroll(source, (await createUser("extra")).id);
    const waiting = await createUser("waiting");
    const [entry] = await integrationDb!
      .insert(festivalActivityWaitlist)
      .values({ activityId, userId: waiting.id, position: 1 })
      .returning();

    const move = await moveActivityParticipant(row.id, target);
    expect(move.sourceActiveCount).toBe(1);
    const undo = await moveActivityParticipant(row.id, source, {
      expectedSourceDetailId: target,
      undo: undoOf(move),
    });

    expect(undo.success).toBe(true);
    expect((await participation(row.id)).detailsId).toBe(source);
    const [untouched] = await integrationDb!
      .select()
      .from(festivalActivityWaitlist)
      .where(eq(festivalActivityWaitlist.id, entry.id));
    // The undo frees a slot in target; restoring the earlier state invites
    // nobody to it.
    expect(untouched.notifiedAt).toBeNull();
  });

  it("refuses an undo into a seat a waitlist invitation now holds", async () => {
    const { activityId, source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const move = await moveActivityParticipant(row.id, target);
    await integrationDb!.insert(festivalActivityWaitlist).values({
      activityId,
      userId: (await createUser("invited")).id,
      position: 1,
      notifiedAt: new Date(),
      expiresAt: new Date(Date.now() + DAY),
      notifiedForDetailId: source,
    });

    const undo = await moveActivityParticipant(row.id, source, {
      expectedSourceDetailId: target,
      undo: undoOf(move),
    });

    expect(undo).toEqual({ success: false, message: FULL_MESSAGE });
  });

  it("undoes a move right away", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);

    const move = await moveActivityParticipant(row.id, target);
    const undo = await moveActivityParticipant(row.id, source, {
      expectedSourceDetailId: target,
      undo: undoOf(move),
    });

    expect(undo.success).toBe(true);
    expect((await participation(row.id)).detailsId).toBe(source);
  });

  it("refuses a stale undo once later moves bring the participant back", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);

    const first = await moveActivityParticipant(row.id, target);
    await moveActivityParticipant(row.id, source, {
      expectedSourceDetailId: target,
    });
    const second = await moveActivityParticipant(row.id, target, {
      expectedSourceDetailId: source,
    });

    // Same variants as the first move, but another admin's later move.
    const stale = await moveActivityParticipant(row.id, source, {
      expectedSourceDetailId: target,
      undo: undoOf(first),
    });
    expect(stale).toEqual({ success: false, message: STALE_MESSAGE });
    expect((await participation(row.id)).detailsId).toBe(target);

    const latest = await moveActivityParticipant(row.id, source, {
      expectedSourceDetailId: target,
      undo: undoOf(second),
    });
    expect(latest.success).toBe(true);
    expect((await participation(row.id)).detailsId).toBe(source);
  });

  it("refuses an undo after a removal and restore", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const move = await moveActivityParticipant(row.id, target);
    await integrationDb!
      .update(festivalActivityParticipants)
      .set({ removedAt: new Date(), removalReason: "x" })
      .where(eq(festivalActivityParticipants.id, row.id));
    expect(await restoreActivityParticipant(row.id)).toMatchObject({
      success: true,
    });

    const undo = await moveActivityParticipant(row.id, source, {
      expectedSourceDetailId: target,
      undo: undoOf(move),
    });

    expect(undo).toEqual({ success: false, message: STALE_MESSAGE });
    expect((await participation(row.id)).detailsId).toBe(target);
  });

  it("refuses an undo without the move's revision", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    await moveActivityParticipant(row.id, target);

    const undo = await moveActivityParticipant(row.id, source, {
      expectedSourceDetailId: target,
      // What a hand-made request could send.
      undo: { maxActive: 0 } as unknown as MoveParticipantOptions["undo"],
    });

    expect(undo).toEqual({ success: false, message: STALE_MESSAGE });
    expect((await participation(row.id)).detailsId).toBe(target);
  });

  it("refuses an undo once someone took the freed seat", async () => {
    const { source, target, participant } = fixture;
    // Source limit is 1: the move leaves it empty, then someone enrolls.
    const row = await enroll(source, participant.id);
    const move = await moveActivityParticipant(row.id, target);
    expect(move.sourceActiveCount).toBe(0);
    await enroll(source, (await createUser("newcomer")).id);

    const undo = await moveActivityParticipant(row.id, source, {
      expectedSourceDetailId: target,
      undo: undoOf(move),
    });

    expect(undo).toEqual({ success: false, message: FULL_MESSAGE });
    expect((await participation(row.id)).detailsId).toBe(target);
    expect(await activeIn(source)).toBe(1);
  });

  it("refuses to move a participant who received votes", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const [vote] = await integrationDb!
      .insert(festivalActivityVotes)
      .values({
        voterId: (await createUser("voter")).id,
        activityVariantId: source,
        votableType: "participant",
        participantId: row.id,
      })
      .returning();

    const result = await moveActivityParticipant(row.id, target);

    expect(result).toEqual({
      success: false,
      message:
        "El participante ya recibió votos; no se puede mover de variante",
    });
    expect((await participation(row.id)).detailsId).toBe(source);
    const votes = await integrationDb!
      .select()
      .from(festivalActivityVotes)
      .where(eq(festivalActivityVotes.id, vote.id));
    expect(votes).toEqual([vote]);
  });

  it("refuses to move a participant whose stand received votes", async () => {
    const { festivalId, source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const [stand] = await integrationDb!
      .insert(stands)
      .values({ standNumber: 9200, festivalId })
      .returning({ id: stands.id });
    standIds.push(stand.id);
    const [reservation] = await integrationDb!
      .insert(standReservations)
      .values({ standId: stand.id, festivalId, status: "accepted" })
      .returning({ id: standReservations.id });
    await integrationDb!
      .insert(reservationParticipants)
      .values({ userId: participant.id, reservationId: reservation.id });
    await integrationDb!.insert(festivalActivityVotes).values({
      voterId: (await createUser("voter")).id,
      activityVariantId: source,
      votableType: "stand",
      standId: stand.id,
    });

    const result = await moveActivityParticipant(row.id, target);

    expect(result.success).toBe(false);
    expect((await participation(row.id)).detailsId).toBe(source);
  });

  it("moves a participant when the votes went to someone else", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const [otherTarget] = await integrationDb!
      .insert(festivalActivityParticipants)
      .values({ detailsId: target, userId: (await createUser("other")).id })
      .returning();
    await integrationDb!.insert(festivalActivityVotes).values({
      voterId: (await createUser("voter")).id,
      activityVariantId: target,
      votableType: "participant",
      participantId: otherTarget.id,
    });

    const result = await moveActivityParticipant(row.id, target);

    expect(result.success).toBe(true);
  });

  it("reports an invitation it could not send, and the retry invites without moving", async () => {
    const { activityId, source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const waiting = await createUser("waiting");
    const [entry] = await integrationDb!
      .insert(festivalActivityWaitlist)
      .values({ activityId, userId: waiting.id, position: 1 })
      .returning();
    sendEmail.mockResolvedValueOnce(emailRejected);

    const result = await moveActivityParticipant(row.id, target);

    expect(result).toMatchObject({ success: true, invitationFailed: true });
    expect(result.invitedName).toBeUndefined();
    const [unclaimed] = await integrationDb!
      .select()
      .from(festivalActivityWaitlist)
      .where(eq(festivalActivityWaitlist.id, entry.id));
    // The claim rolled back with the failed send.
    expect(unclaimed.notifiedAt).toBeNull();

    const retry = await retryWaitlistInvitation(activityId, source);

    expect(retry).toEqual({
      success: true,
      message: "Se invitó a waiting de la lista de espera",
      invitedName: "waiting",
    });
    const [invited] = await integrationDb!
      .select()
      .from(festivalActivityWaitlist)
      .where(eq(festivalActivityWaitlist.id, entry.id));
    expect(invited.notifiedForDetailId).toBe(source);
    expect((await participation(row.id)).detailsId).toBe(target);
  });

  it("reports a retry that fails again or finds nobody to invite", async () => {
    const { activityId, source } = fixture;
    const waiting = await createUser("waiting");
    await integrationDb!
      .insert(festivalActivityWaitlist)
      .values({ activityId, userId: waiting.id, position: 1 });

    sendEmail.mockResolvedValueOnce(emailRejected);
    await expect(retryWaitlistInvitation(activityId, source)).resolves.toEqual({
      success: false,
      message: "No se pudo enviar la invitación. Intentá nuevamente.",
    });

    // Source's only slot taken: nobody is due an invitation.
    await enroll(source, (await createUser("seated")).id);
    const nobody = await retryWaitlistInvitation(activityId, source);
    expect(nobody.success).toBe(false);
    expect(nobody.invitedName).toBeUndefined();
  });

  it("refuses a retry for a variant of another activity, or from anyone but staff", async () => {
    const { activityId, source, participant } = fixture;
    const [otherActivity] = await integrationDb!
      .insert(festivalActivities)
      .values({
        festivalId: festivalIds[0],
        name: "Otra",
        type: "coupon_book",
        registrationStartDate: new Date(),
        registrationEndDate: new Date(Date.now() + DAY),
        waitlistWindowMinutes: 60,
      })
      .returning({ id: festivalActivities.id });

    await expect(
      retryWaitlistInvitation(otherActivity.id, source),
    ).resolves.toEqual({
      success: false,
      message: "La variante de actividad no existe",
    });

    currentProfile.mockResolvedValue(participant);
    const denied = await retryWaitlistInvitation(activityId, source);
    expect(denied.success).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("keeps the seat a move freed for the invited profile", async () => {
    const { festivalId, activityId, source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const waiting = await createUser("waiting");
    const [entry] = await integrationDb!
      .insert(festivalActivityWaitlist)
      .values({ activityId, userId: waiting.id, position: 1 })
      .returning();
    const outsider = await createUser("outsider");

    const move = await moveActivityParticipant(row.id, target);
    expect(move.invitedName).toBe("waiting");

    // The moved row left source, so no removed row marks the seat as freed.
    currentProfile.mockResolvedValue(outsider);
    const taken = await enrollInActivity(
      outsider as BaseProfile,
      festivalId,
      { id: source } as ActivityDetailsWithParticipants,
      { id: activityId } as FestivalActivity,
    );
    expect(taken).toEqual({
      success: false,
      message:
        "Este cupo está reservado para participantes en la lista de espera",
    });

    currentProfile.mockResolvedValue(waiting);
    const accepted = await enrollFromWaitlistInvitation(
      waiting.id,
      entry.id,
      festivalId,
    );
    expect(accepted).toEqual({
      success: true,
      message: "Inscripción realizada correctamente",
    });
    expect(await activeIn(source)).toBe(1);
  });

  it("gives the last seat to one of a restore and a move racing for it", async () => {
    const { source, target, participant } = fixture;
    // Target limit is 2: one seated, one removed who could be restored.
    await enroll(target, (await createUser("seated")).id);
    const removed = await enroll(
      target,
      (await createUser("removed")).id,
      true,
    );
    const row = await enroll(source, participant.id);

    const results = await behindLock(variantLock(target), 2, () => [
      restoreActivityParticipant(removed.id),
      moveActivityParticipant(row.id, target),
    ]);

    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(await activeIn(target)).toBe(2);
  });

  it("does not record a manual invitation once the seat filled during its email", async () => {
    const { festivalId, activityId, source, target, participant } = fixture;
    const waiting = await createUser("waiting");
    const [entry] = await integrationDb!
      .insert(festivalActivityWaitlist)
      .values({ activityId, userId: waiting.id, position: 1 })
      .returning();
    // Target is full; source (limit 1) is the variant with room.
    await enroll(target, (await createUser("seated-1")).id);
    await enroll(target, (await createUser("seated-2")).id);
    const row = await enroll(target, participant.id);
    sendEmail.mockImplementationOnce(async () => {
      // A move takes source's seat while the invitation is on its way.
      await integrationDb!
        .update(festivalActivityParticipants)
        .set({ detailsId: source })
        .where(eq(festivalActivityParticipants.id, row.id));
      return { data: { id: "email-1" }, error: null, headers: null };
    });

    const result = await notifyWaitlistEntry(entry.id, festivalId);

    expect(result).toEqual({
      success: false,
      message: "No se pudo guardar la notificación; intentá nuevamente",
    });
    const [unchanged] = await integrationDb!
      .select()
      .from(festivalActivityWaitlist)
      .where(eq(festivalActivityWaitlist.id, entry.id));
    expect(unchanged.notifiedAt).toBeNull();
  });

  it("gives the last seat to one of two enrolments racing for it", async () => {
    const { festivalId, activityId, target } = fixture;
    await enroll(target, (await createUser("seated")).id);
    const first = await createUser("first");
    const second = await createUser("second");
    // Each enrolment reads the session once, at its start.
    currentProfile.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    const results = await Promise.all(
      [first, second].map((profile) =>
        enrollInActivity(
          profile as BaseProfile,
          festivalId,
          { id: target } as ActivityDetailsWithParticipants,
          { id: activityId } as FestivalActivity,
        ),
      ),
    );

    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(await activeIn(target)).toBe(2);
  });

  it("gives the last seat to one of an enrolment and a move racing for it", async () => {
    const { festivalId, activityId, source, target, participant } = fixture;
    await enroll(target, (await createUser("seated")).id);
    const row = await enroll(source, participant.id);
    // Both actions read the one mocked session: as staff, the newcomer may
    // move someone and enroll themselves.
    const newcomer = await createUser("newcomer", { role: "admin" });
    currentProfile.mockResolvedValue(newcomer);

    const results = await behindLock(variantLock(target), 2, () => [
      enrollInActivity(
        newcomer as BaseProfile,
        festivalId,
        { id: target } as ActivityDetailsWithParticipants,
        { id: activityId } as FestivalActivity,
      ),
      moveActivityParticipant(row.id, target),
    ]);

    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(await activeIn(target)).toBe(2);
  });

  it("skips a waitlisted profile who enrolled while the promotion waited for the variant", async () => {
    const { activityId, target } = fixture;
    const waiting = await createUser("waiting");
    const [entry] = await integrationDb!
      .insert(festivalActivityWaitlist)
      .values({ activityId, userId: waiting.id, position: 1 })
      .returning();

    // The profile accepts an invitation, under the variant lock, while the
    // promotion waits for it.
    const [result] = await behindLock(
      variantLock(target),
      1,
      () => [promoteWaitlistToVariant(activityId, target)],
      (client) =>
        client.query(
          "insert into festival_activity_participants (details_id, user_id) values ($1, $2)",
          [target, waiting.id],
        ),
    );

    expect(result).toMatchObject({ success: true, promoted: 0 });
    const rows = await integrationDb!
      .select()
      .from(festivalActivityParticipants)
      .where(eq(festivalActivityParticipants.userId, waiting.id));
    expect(rows).toHaveLength(1);
    const [kept] = await integrationDb!
      .select()
      .from(festivalActivityWaitlist)
      .where(eq(festivalActivityWaitlist.id, entry.id));
    expect(kept).toBeDefined();
  });

  it("refuses a vote that waited for a move of the participant", async () => {
    const { activityId, source, target, participant } = fixture;
    await integrationDb!
      .update(festivalActivities)
      .set({
        allowsVoting: true,
        votingStartDate: new Date(Date.now() - DAY),
        votingEndDate: new Date(Date.now() + DAY),
      })
      .where(eq(festivalActivities.id, activityId));
    const row = await enroll(source, participant.id);
    await integrationDb!.insert(festivalActivityParticipantProofs).values({
      participationId: row.id,
      imageUrl: "https://example.test/design.png",
    });
    currentProfile.mockResolvedValue(await createUser("voter"));

    // The move holds the participant's row while the vote validates it.
    const [result] = await behindLock(
      {
        text: "select id from festival_activity_participants where id = $1 for update",
        values: [row.id],
      },
      1,
      () => [
        addFestivalActivityVote({
          activityVariantId: source,
          votableType: "participant",
          participantId: row.id,
        }),
      ],
      (client) =>
        client.query(
          "update festival_activity_participants set details_id = $1 where id = $2",
          [target, row.id],
        ),
    );

    expect(result).toEqual({
      success: false,
      message: "El participante no existe",
    });
    const votes = await integrationDb!
      .select()
      .from(festivalActivityVotes)
      .where(eq(festivalActivityVotes.participantId, row.id));
    expect(votes).toEqual([]);
  });

  it("keeps one consistent row when the same participant is moved twice at once", async () => {
    const { activityId, source, target, participant } = fixture;
    const third = await createVariant(activityId, null);
    const row = await enroll(source, participant.id);

    const results = await Promise.all([
      moveActivityParticipant(row.id, target, {
        expectedSourceDetailId: source,
      }),
      moveActivityParticipant(row.id, third, {
        expectedSourceDetailId: source,
      }),
    ]);

    // The waiting move re-reads the row the winner left and sees it moved.
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.find((r) => !r.success)?.message).toBe(
      "El participante ya fue movido a otra variante. Actualizá la página.",
    );
    const rows = await integrationDb!
      .select()
      .from(festivalActivityParticipants)
      .where(eq(festivalActivityParticipants.userId, participant.id));
    expect(rows).toHaveLength(1);
    expect([target, third]).toContain(rows[0].detailsId);
  });

  it("refuses a full target, counting outstanding invitations", async () => {
    const { activityId, source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    await enroll(target, (await createUser("seated")).id);
    await integrationDb!.insert(festivalActivityWaitlist).values({
      activityId,
      userId: (await createUser("invited")).id,
      position: 1,
      notifiedAt: new Date(),
      expiresAt: new Date(Date.now() + DAY),
      notifiedForDetailId: target,
    });

    const result = await moveActivityParticipant(row.id, target);

    expect(result).toEqual({
      success: false,
      message: "La variante de destino no tiene cupos disponibles",
    });
    expect((await participation(row.id)).detailsId).toBe(source);
  });

  it("refuses a target restricted to another category", async () => {
    const { activityId, source, participant } = fixture;
    const gastronomy = await createVariant(activityId, null, "gastronomy");
    const row = await enroll(source, participant.id);

    const result = await moveActivityParticipant(row.id, gastronomy);

    expect(result.success).toBe(false);
    expect((await participation(row.id)).detailsId).toBe(source);
  });

  it("refuses a variant of another activity", async () => {
    const { source, participant } = fixture;
    const [otherActivity] = await integrationDb!
      .insert(festivalActivities)
      .values({
        festivalId: festivalIds[0],
        name: "Otra",
        type: "coupon_book",
        registrationStartDate: new Date(),
        registrationEndDate: new Date(Date.now() + DAY),
      })
      .returning({ id: festivalActivities.id });
    const foreign = await createVariant(otherActivity.id, null);
    const row = await enroll(source, participant.id);

    const result = await moveActivityParticipant(row.id, foreign);

    expect(result).toEqual({
      success: false,
      message: "La variante de destino no pertenece a esta actividad",
    });
  });

  it("refuses a removed participant", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id, true);

    const result = await moveActivityParticipant(row.id, target);

    expect(result.success).toBe(false);
    expect((await participation(row.id)).detailsId).toBe(source);
  });

  it("refuses anyone but staff", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    currentProfile.mockResolvedValue(participant);

    const result = await moveActivityParticipant(row.id, target);

    expect(result.success).toBe(false);
    expect((await participation(row.id)).detailsId).toBe(source);
  });
});
