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
let updateFestivalActivity: AdminActions["updateFestivalActivity"];
let enrollInActivity: Actions["enrollInActivity"];
let enrollFromWaitlistInvitation: Actions["enrollFromWaitlistInvitation"];
let addFestivalActivityVote: Actions["addFestivalActivityVote"];
let joinActivityWaitlist: Actions["joinActivityWaitlist"];
let processExpiredWaitlistNotifications: typeof import("@/app/lib/festival_activites/scheduled-actions").processExpiredWaitlistNotifications;

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
  return { revision: move.revision! };
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
  let racers: Promise<T>[] = [];
  let pending: Promise<T[]> | undefined;
  try {
    await client.query("begin");
    await client.query(lock.text, lock.values);
    const {
      rows: [{ pid }],
    } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
    racers = race();
    pending = Promise.all(racers);
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
    // Let every racer finish before the fixtures are cleaned up, not only
    // until the first one fails.
    await Promise.allSettled(racers);
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

type WaitlistRow = typeof festivalActivityWaitlist.$inferSelect;

async function addToWaitlist(
  userId: number,
  position: number,
  values: Partial<typeof festivalActivityWaitlist.$inferInsert> = {},
): Promise<WaitlistRow> {
  const [entry] = await integrationDb!
    .insert(festivalActivityWaitlist)
    .values({ activityId: fixture.activityId, userId, position, ...values })
    .returning();
  return entry;
}

/** An unexpired invitation to a seat in `detailId`. */
function invitedTo(detailId: number) {
  return {
    notifiedAt: new Date(),
    expiresAt: new Date(Date.now() + DAY),
    notifiedForDetailId: detailId,
  };
}

async function waitlistRow(id: number): Promise<WaitlistRow | undefined> {
  const [row] = await integrationDb!
    .select()
    .from(festivalActivityWaitlist)
    .where(eq(festivalActivityWaitlist.id, id));
  return row;
}

/** `profile` enrolls itself in `detailId`, as the activity page does. */
function enrollAs(profile: UserRow, detailId: number) {
  currentProfile.mockResolvedValue(profile);
  return enrollInActivity(
    profile as BaseProfile,
    fixture.festivalId,
    { id: detailId } as ActivityDetailsWithParticipants,
    { id: fixture.activityId } as FestivalActivity,
  );
}

/** `profile` joins the activity's waitlist, as the activity page does. */
function joinWaitlistAs(profile: UserRow) {
  currentProfile.mockResolvedValue(profile);
  return joinActivityWaitlist(profile as BaseProfile, fixture.activityId);
}

const RESERVED_MESSAGE =
  "Este cupo está reservado para participantes en la lista de espera";
const NO_INVITATION_MESSAGE = "No tenés una invitación activa para inscribirte";

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
      updateFestivalActivity,
    } = await import("@/app/lib/festival_activites/admin-actions"));
    ({
      enrollInActivity,
      enrollFromWaitlistInvitation,
      addFestivalActivityVote,
      joinActivityWaitlist,
    } = await import("@/app/lib/festival_activites/actions"));
    ({ processExpiredWaitlistNotifications } =
      await import("@/app/lib/festival_activites/scheduled-actions"));
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
      undo: {} as unknown as MoveParticipantOptions["undo"],
    });

    expect(undo).toEqual({ success: false, message: STALE_MESSAGE });
    expect((await participation(row.id)).detailsId).toBe(target);
  });

  it("refuses an undo once someone took the freed seat", async () => {
    const { source, target, participant } = fixture;
    // Source limit is 1: the move leaves it empty, then someone enrolls.
    const row = await enroll(source, participant.id);
    const move = await moveActivityParticipant(row.id, target);
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

    // The invitation holds the seat the move freed.
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

  it("sends no manual invitation once the seat filled before its claim", async () => {
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

    // A move takes source's seat after the variant was picked, while the
    // claim waits for source.
    const [result] = await behindLock(
      variantLock(source),
      1,
      () => [notifyWaitlistEntry(entry.id, festivalId)],
      (client) =>
        client.query(
          "update festival_activity_participants set details_id = $1 where id = $2",
          [source, row.id],
        ),
    );

    expect(result).toEqual({
      success: false,
      message: "No hay cupos disponibles para la categoría de este usuario",
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await waitlistRow(entry.id))?.notifiedAt).toBeNull();
  });

  it("passes a manual invitation on to the next variant once the first filled before its claim", async () => {
    const { festivalId, source, target } = fixture;
    const waiting = await createUser("waiting");
    const entry = await addToWaitlist(waiting.id, 1);
    const seated = await createUser("seated");

    // Both variants have room when picked; source's seat is taken while the
    // claim waits for it.
    const [result] = await behindLock(
      variantLock(source),
      1,
      () => [notifyWaitlistEntry(entry.id, festivalId)],
      (client) =>
        client.query(
          "insert into festival_activity_participants (details_id, user_id) values ($1, $2)",
          [source, seated.id],
        ),
    );

    expect(result).toEqual({
      success: true,
      message: "Notificación enviada correctamente",
    });
    expect((await waitlistRow(entry.id))?.notifiedForDetailId).toBe(target);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: [waiting.email] }),
    );
  });

  it("keeps no manual invitation whose email failed", async () => {
    const { festivalId, activityId } = fixture;
    const waiting = await createUser("waiting");
    const [entry] = await integrationDb!
      .insert(festivalActivityWaitlist)
      .values({ activityId, userId: waiting.id, position: 1 })
      .returning();
    sendEmail.mockResolvedValueOnce(emailRejected);

    const result = await notifyWaitlistEntry(entry.id, festivalId);

    expect(result).toEqual({
      success: false,
      message: "Error al enviar la notificación",
    });
    expect(sendEmail).toHaveBeenCalledOnce();
    const unclaimed = await waitlistRow(entry.id);
    expect(unclaimed?.notifiedAt).toBeNull();
    expect(unclaimed?.notifiedForDetailId).toBeNull();
  });

  it("gives the last seat to one of two enrolments racing for it", async () => {
    const { festivalId, activityId, target } = fixture;
    await enroll(target, (await createUser("seated")).id);
    const first = await createUser("first");
    const second = await createUser("second");
    // Each enrolment reads the session once, at its start.
    currentProfile.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    // Both queue for the variant before either counts, so an enrolment that
    // skipped the lock would take the seat too.
    const results = await behindLock(variantLock(target), 2, () =>
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

  it.each([
    {
      change: "enrolled in another variant",
      // Leaving the entry behind, as an older enrolment did, so only the
      // claim's check of every variant stops the promotion.
      write: (client: PoolClient, entry: WaitlistRow) =>
        client.query(
          "insert into festival_activity_participants (details_id, user_id) values ($1, $2)",
          [fixture.source, entry.userId],
        ),
      enrolledInSource: true,
    },
    {
      change: "left the waitlist",
      write: (client: PoolClient, entry: WaitlistRow) =>
        client.query("delete from festival_activity_waitlist where id = $1", [
          entry.id,
        ]),
      enrolledInSource: false,
    },
  ])(
    "promotes nobody who $change while the promotion waited for the variant",
    async ({ write, enrolledInSource }) => {
      const { activityId, source, target } = fixture;
      const waiting = await createUser("waiting");
      const entry = await addToWaitlist(waiting.id, 1);

      const [result] = await behindLock(
        variantLock(target),
        1,
        () => [promoteWaitlistToVariant(activityId, target)],
        (client) => write(client, entry),
      );

      expect(result).toMatchObject({ success: true, promoted: 0 });
      expect(await activeIn(target)).toBe(0);
      const rows = await integrationDb!
        .select()
        .from(festivalActivityParticipants)
        .where(eq(festivalActivityParticipants.userId, waiting.id));
      expect(rows.map((row) => row.detailsId)).toEqual(
        enrolledInSource ? [source] : [],
      );
    },
  );

  it("skips the stale entry of a profile already enrolled, and promotes the next", async () => {
    const { activityId, source, target } = fixture;
    // An entry an older enrolment left behind.
    const enrolled = await createUser("enrolled");
    await enroll(source, enrolled.id);
    await addToWaitlist(enrolled.id, 1);
    const next = await createUser("next");
    const nextEntry = await addToWaitlist(next.id, 2);

    const result = await promoteWaitlistToVariant(activityId, target);

    expect(result).toMatchObject({ success: true, promoted: 1 });
    const rows = await integrationDb!
      .select()
      .from(festivalActivityParticipants)
      .where(eq(festivalActivityParticipants.userId, enrolled.id));
    expect(rows.map((row) => row.detailsId)).toEqual([source]);
    expect(await activeIn(target)).toBe(1);
    expect(await waitlistRow(nextEntry.id)).toBeUndefined();
  });

  it("offers on the seat of an invitation a bulk promotion consumed", async () => {
    const { activityId, source, target } = fixture;
    // One seat left in target, for the first waiter, invited to source.
    await enroll(target, (await createUser("seated")).id);
    const invited = await createUser("invited");
    const invitedEntry = await addToWaitlist(invited.id, 1, invitedTo(source));
    const next = await createUser("next");
    const nextEntry = await addToWaitlist(next.id, 2);

    const result = await promoteWaitlistToVariant(activityId, target);

    expect(result).toMatchObject({ success: true, promoted: 1 });
    expect(await waitlistRow(invitedEntry.id)).toBeUndefined();
    expect((await waitlistRow(nextEntry.id))?.notifiedForDetailId).toBe(source);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: [next.email] }),
    );
  });

  it("offers on a consumed invitation's seat only once the bulk promotion is done", async () => {
    const { activityId, source, target } = fixture;
    // Both target seats free: the first waiter, invited to source, and the
    // next one get them, so only the third is due the source seat.
    const invited = await createUser("invited");
    await addToWaitlist(invited.id, 1, invitedTo(source));
    const next = await createUser("next");
    await addToWaitlist(next.id, 2);
    const third = await createUser("third");
    const thirdEntry = await addToWaitlist(third.id, 3);

    const result = await promoteWaitlistToVariant(activityId, target);

    expect(result).toMatchObject({ success: true, promoted: 2 });
    const rows = await integrationDb!
      .select()
      .from(festivalActivityParticipants)
      .where(eq(festivalActivityParticipants.detailsId, target));
    expect(rows.map((row) => row.userId).sort()).toEqual(
      [invited.id, next.id].sort(),
    );
    expect((await waitlistRow(thirdEntry.id))?.notifiedForDetailId).toBe(
      source,
    );
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: [third.email] }),
    );
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

  it.each([
    [
      "deleted by the expiry cron",
      "delete from festival_activity_waitlist where id = $1",
    ],
    [
      "expired",
      "update festival_activity_waitlist set expires_at = now() - interval '1 minute' where id = $1",
    ],
  ])(
    "refuses an acceptance whose invitation was %s while it waited for the variant",
    async (_, change) => {
      const { festivalId, source } = fixture;
      const invited = await createUser("invited");
      const entry = await addToWaitlist(invited.id, 1, invitedTo(source));
      currentProfile.mockResolvedValue(invited);

      const [result] = await behindLock(
        variantLock(source),
        1,
        () => [enrollFromWaitlistInvitation(invited.id, entry.id, festivalId)],
        (client) => client.query(change, [entry.id]),
      );

      expect(result).toEqual({
        success: false,
        message: NO_INVITATION_MESSAGE,
      });
      const rows = await integrationDb!
        .select()
        .from(festivalActivityParticipants)
        .where(eq(festivalActivityParticipants.userId, invited.id));
      expect(rows).toEqual([]);
    },
  );

  it("refuses an acceptance whose invitation moved to another variant meanwhile", async () => {
    const { festivalId, source, target } = fixture;
    const invited = await createUser("invited");
    const entry = await addToWaitlist(invited.id, 1, invitedTo(source));
    currentProfile.mockResolvedValue(invited);

    const [result] = await behindLock(
      variantLock(source),
      1,
      () => [enrollFromWaitlistInvitation(invited.id, entry.id, festivalId)],
      (client) =>
        client.query(
          "update festival_activity_waitlist set notified_for_detail_id = $1 where id = $2",
          [target, entry.id],
        ),
    );

    expect(result).toEqual({ success: false, message: NO_INVITATION_MESSAGE });
    expect(await activeIn(source)).toBe(0);
    // The new invitation is still there to accept.
    expect((await waitlistRow(entry.id))?.notifiedForDetailId).toBe(target);
  });

  it("counts against a limit lowered while an enrolment waited for the variant", async () => {
    const { target } = fixture;
    // Target limit is 2 with one seat taken; staff lower it to 1.
    await enroll(target, (await createUser("seated")).id);
    const newcomer = await createUser("newcomer");

    const [result] = await behindLock(
      variantLock(target),
      1,
      () => [enrollAs(newcomer, target)],
      (client) =>
        client.query(
          "update festival_activity_details set participation_limit = 1 where id = $1",
          [target],
        ),
    );

    expect(result).toEqual({
      success: false,
      message: "Ya no hay cupo disponible",
    });
    expect(await activeIn(target)).toBe(1);
  });

  it("counts against a limit lowered while an acceptance waited for the variant", async () => {
    const { festivalId, target } = fixture;
    await enroll(target, (await createUser("seated")).id);
    const invited = await createUser("invited");
    const entry = await addToWaitlist(invited.id, 1, invitedTo(target));
    currentProfile.mockResolvedValue(invited);

    const [result] = await behindLock(
      variantLock(target),
      1,
      () => [enrollFromWaitlistInvitation(invited.id, entry.id, festivalId)],
      (client) =>
        client.query(
          "update festival_activity_details set participation_limit = 1 where id = $1",
          [target],
        ),
    );

    expect(result).toEqual({
      success: false,
      message: "El cupo ya no está disponible",
    });
    expect(await activeIn(target)).toBe(1);
  });

  it("promotes no further than a limit lowered while the promotion waited", async () => {
    const { activityId, target } = fixture;
    await integrationDb!
      .update(festivalActivityDetails)
      .set({ participationLimit: 3 })
      .where(eq(festivalActivityDetails.id, target));
    await enroll(target, (await createUser("seated")).id);
    await addToWaitlist((await createUser("first")).id, 1);
    await addToWaitlist((await createUser("second")).id, 2);

    const [result] = await behindLock(
      variantLock(target),
      1,
      () => [promoteWaitlistToVariant(activityId, target)],
      (client) =>
        client.query(
          "update festival_activity_details set participation_limit = 2 where id = $1",
          [target],
        ),
    );

    expect(result).toMatchObject({ success: true, promoted: 1 });
    expect(await activeIn(target)).toBe(2);
  });

  it("gives up an invitation its profile enrolled past, freeing the seat for the next invitee", async () => {
    const { festivalId, target } = fixture;
    // Target limit is 2, and both seats are reserved by invitations.
    const first = await createUser("first");
    const second = await createUser("second");
    const firstEntry = await addToWaitlist(first.id, 1, invitedTo(target));
    const secondEntry = await addToWaitlist(second.id, 2, invitedTo(target));

    // The first enrolls from the activity page instead of the invitation.
    expect(await enrollAs(first, target)).toMatchObject({ success: true });
    expect(await waitlistRow(firstEntry.id)).toBeUndefined();

    currentProfile.mockResolvedValue(second);
    const accepted = await enrollFromWaitlistInvitation(
      second.id,
      secondEntry.id,
      festivalId,
    );
    expect(accepted).toEqual({
      success: true,
      message: "Inscripción realizada correctamente",
    });
    expect(await activeIn(target)).toBe(2);
  });

  it("offers on the seat of an invitation for another variant its profile enrolled past", async () => {
    const { activityId, source } = fixture;
    const open = await createVariant(activityId, null);
    const invited = await createUser("invited");
    const next = await createUser("next");
    const invitedEntry = await addToWaitlist(invited.id, 1, invitedTo(source));
    const nextEntry = await addToWaitlist(next.id, 2);

    expect(await enrollAs(invited, open)).toMatchObject({ success: true });

    expect(await waitlistRow(invitedEntry.id)).toBeUndefined();
    const offered = await waitlistRow(nextEntry.id);
    expect(offered?.notifiedForDetailId).toBe(source);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: [next.email] }),
    );
  });

  it("keeps a seat a move freed for the waitlist while its invitation failed", async () => {
    const { activityId, source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const waiting = await createUser("waiting");
    const entry = await addToWaitlist(waiting.id, 1);
    sendEmail.mockResolvedValueOnce(emailRejected);

    const move = await moveActivityParticipant(row.id, target);
    expect(move).toMatchObject({ success: true, invitationFailed: true });

    // No invitation holds the seat, but it is due to the waiter ahead.
    expect(await enrollAs(await createUser("outsider"), source)).toEqual({
      success: false,
      message: RESERVED_MESSAGE,
    });

    // The refusal offers the seat on, as nothing else would.
    expect((await waitlistRow(entry.id))?.notifiedForDetailId).toBe(source);
    expect(sendEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: [waiting.email] }),
    );

    currentProfile.mockResolvedValue(fixture.admin);
    expect(await retryWaitlistInvitation(activityId, source)).toMatchObject({
      success: false,
    });
  });

  it("gives a seat freed before its promotion to the waitlist, then to whoever waits", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const waiting = await createUser("waiting");
    const entry = await addToWaitlist(waiting.id, 1);
    // A move that committed, before its promotion ran.
    await integrationDb!
      .update(festivalActivityParticipants)
      .set({ detailsId: target, updatedAt: new Date() })
      .where(eq(festivalActivityParticipants.id, row.id));

    expect(await enrollAs(await createUser("outsider"), source)).toEqual({
      success: false,
      message: RESERVED_MESSAGE,
    });
    expect((await waitlistRow(entry.id))?.notifiedForDetailId).toBe(source);

    expect(await enrollAs(waiting, source)).toMatchObject({ success: true });
    expect(await waitlistRow(entry.id)).toBeUndefined();
  });

  it("lets the first waiter take a seat nobody offered, without yielding to those behind", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const first = await createUser("first");
    const firstEntry = await addToWaitlist(first.id, 1);
    const second = await createUser("second");
    const secondEntry = await addToWaitlist(second.id, 2);
    // A move that committed, before its promotion ran.
    await integrationDb!
      .update(festivalActivityParticipants)
      .set({ detailsId: target, updatedAt: new Date() })
      .where(eq(festivalActivityParticipants.id, row.id));

    expect(await enrollAs(first, source)).toMatchObject({ success: true });
    expect(await waitlistRow(firstEntry.id)).toBeUndefined();
    expect((await waitlistRow(secondEntry.id))?.notifiedAt).toBeNull();
  });

  it("leaves a raised limit's seats to the waiters ahead, and offers on the ones it holds", async () => {
    const { activityId, participant } = fixture;
    const variant = await createVariant(activityId, 1);
    await enroll(variant, participant.id);
    const first = await createUser("first");
    const firstEntry = await addToWaitlist(first.id, 1);
    const second = await createUser("second");
    const secondEntry = await addToWaitlist(second.id, 2);
    // Staff raise the limit, which invites nobody.
    await integrationDb!
      .update(festivalActivityDetails)
      .set({ participationLimit: 2 })
      .where(eq(festivalActivityDetails.id, variant));

    // The one free seat is the first waiter's, so it is offered to them.
    expect(await enrollAs(second, variant)).toEqual({
      success: false,
      message: RESERVED_MESSAGE,
    });
    expect((await waitlistRow(firstEntry.id))?.notifiedForDetailId).toBe(
      variant,
    );
    expect((await waitlistRow(secondEntry.id))?.notifiedAt).toBeNull();

    // A second free seat is the second waiter's to take.
    await integrationDb!
      .update(festivalActivityDetails)
      .set({ participationLimit: 3 })
      .where(eq(festivalActivityDetails.id, variant));
    expect(await enrollAs(second, variant)).toMatchObject({ success: true });
    expect(await enrollAs(await createUser("outsider"), variant)).toEqual({
      success: false,
      message: RESERVED_MESSAGE,
    });
  });

  it("neither waits for nor invites a waitlisted profile already enrolled", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    // An entry an older enrolment left behind.
    const enrolled = await createUser("enrolled");
    await enroll(target, enrolled.id);
    const staleEntry = await addToWaitlist(enrolled.id, 1);

    const move = await moveActivityParticipant(row.id, target);
    expect(move).toMatchObject({ success: true });
    expect((await waitlistRow(staleEntry.id))?.notifiedAt).toBeNull();

    expect(await enrollAs(await createUser("outsider"), source)).toMatchObject({
      success: true,
    });
  });

  it("offers on the seat of an expired invitation its profile enrolled past before the cron ran", async () => {
    const { activityId, source } = fixture;
    const open = await createVariant(activityId, null);
    const expired = await createUser("expired");
    const expiredEntry = await addToWaitlist(expired.id, 1, {
      notifiedAt: new Date(Date.now() - 2 * DAY),
      expiresAt: new Date(Date.now() - DAY),
      notifiedForDetailId: source,
    });
    const next = await createUser("next");
    const nextEntry = await addToWaitlist(next.id, 2);

    expect(await enrollAs(expired, open)).toMatchObject({ success: true });

    expect(await waitlistRow(expiredEntry.id)).toBeUndefined();
    expect((await waitlistRow(nextEntry.id))?.notifiedForDetailId).toBe(source);
  });

  it("lets anyone take a free seat nobody on the waitlist could be invited to", async () => {
    const { activityId, target } = fixture;
    const illustrationOnly = await createVariant(activityId, 1, "illustration");
    // One waits for another category, one was removed from the activity.
    await addToWaitlist(
      (await createUser("gastronomy", { category: "gastronomy" })).id,
      1,
    );
    const removed = await createUser("removed");
    await enroll(target, removed.id, true);
    await addToWaitlist(removed.id, 2);

    expect(
      await enrollAs(await createUser("outsider"), illustrationOnly),
    ).toMatchObject({ success: true });
  });

  it("lets anyone take a seat a removal freed when nobody eligible waits", async () => {
    const { source, target, participant } = fixture;
    // Source limit is 1; its only row was removed, and nobody waits.
    await enroll(source, participant.id, true);

    expect(await enrollAs(await createUser("outsider"), source)).toMatchObject({
      success: true,
    });
    // The removed profile itself stays barred.
    expect(await enrollAs(participant, target)).toEqual({
      success: false,
      message: "No podés volver a inscribirte después de haber sido removido",
    });
  });

  it("leaves a seat a removal freed to an eligible waiter, and offers it to them", async () => {
    const { source, participant } = fixture;
    await enroll(source, participant.id, true);
    const waiting = await createUser("waiting");
    const entry = await addToWaitlist(waiting.id, 1);

    expect(await enrollAs(await createUser("outsider"), source)).toEqual({
      success: false,
      message: RESERVED_MESSAGE,
    });
    expect((await waitlistRow(entry.id))?.notifiedForDetailId).toBe(source);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: [waiting.email] }),
    );
  });

  it("lets the first waiter take a seat a removal freed that nobody offered", async () => {
    const { source, participant } = fixture;
    await enroll(source, participant.id, true);
    const waiting = await createUser("waiting");
    const entry = await addToWaitlist(waiting.id, 1);

    expect(await enrollAs(waiting, source)).toMatchObject({ success: true });
    expect(await waitlistRow(entry.id)).toBeUndefined();
  });

  it("refuses an undo into a full variant someone entered since the move", async () => {
    const { activityId, source, target, participant } = fixture;
    const open = await createVariant(activityId, null);
    // Source limit is 1 and holds 2: over capacity, as staff can leave it.
    const ana = await enroll(source, participant.id);
    const other = await enroll(source, (await createUser("other")).id);
    const newcomer = await enroll(open, (await createUser("newcomer")).id);

    const move = await moveActivityParticipant(ana.id, target);
    // Turnover: the other leaves, the newcomer takes the seat.
    expect(await moveActivityParticipant(other.id, target)).toMatchObject({
      success: true,
    });
    expect(await moveActivityParticipant(newcomer.id, source)).toMatchObject({
      success: true,
    });

    const undo = await moveActivityParticipant(ana.id, source, {
      expectedSourceDetailId: target,
      undo: undoOf(move),
    });

    expect(undo).toEqual({ success: false, message: FULL_MESSAGE });
    expect(await activeIn(source)).toBe(1);
  });

  it("stamps a move later than the row's last write, even within its millisecond", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    // A write the clock has not reached yet, as a skewed instance leaves it.
    const lastWrite = new Date(Date.now() + 60_000);
    await integrationDb!
      .update(festivalActivityParticipants)
      .set({ updatedAt: lastWrite })
      .where(eq(festivalActivityParticipants.id, row.id));

    const move = await moveActivityParticipant(row.id, target);

    expect(Date.parse(move.revision!)).toBeGreaterThan(lastWrite.getTime());
  });

  it("keeps an expired invitation until the cron offers its seat on", async () => {
    const { source } = fixture;
    const expired = await addToWaitlist((await createUser("expired")).id, 1, {
      notifiedAt: new Date(Date.now() - 2 * DAY),
      expiresAt: new Date(Date.now() - DAY),
      notifiedForDetailId: source,
    });
    const next = await addToWaitlist((await createUser("next")).id, 2);
    sendEmail.mockResolvedValueOnce(emailRejected);

    expect(await processExpiredWaitlistNotifications()).toEqual({
      processed: 0,
    });

    // The invitation failed, so the next run must try again.
    expect(await waitlistRow(expired.id)).toBeDefined();
    expect((await waitlistRow(next.id))?.notifiedAt).toBeNull();

    expect(await processExpiredWaitlistNotifications()).toEqual({
      processed: 1,
    });

    expect(await waitlistRow(expired.id)).toBeUndefined();
    const invited = await waitlistRow(next.id);
    expect(invited?.notifiedForDetailId).toBe(source);
    expect(sendEmail).toHaveBeenCalledTimes(2);

    // Nothing left to do: a further run invites nobody else.
    await processExpiredWaitlistNotifications();
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(await waitlistRow(next.id)).toEqual(invited);
  });

  it("keeps and does not count an expired invitation renewed while the cron offered its seat on", async () => {
    const { source, target } = fixture;
    const expired = await addToWaitlist((await createUser("expired")).id, 1, {
      notifiedAt: new Date(Date.now() - 2 * DAY),
      expiresAt: new Date(Date.now() - DAY),
      notifiedForDetailId: source,
    });
    await addToWaitlist((await createUser("next")).id, 2);
    const renewal = invitedTo(target);
    // Staff renew the invitation between the cron's read and its delete.
    sendEmail.mockImplementationOnce(async () => {
      await integrationDb!
        .update(festivalActivityWaitlist)
        .set(renewal)
        .where(eq(festivalActivityWaitlist.id, expired.id));
      return { data: { id: "email-1" }, error: null, headers: null };
    });

    expect(await processExpiredWaitlistNotifications()).toEqual({
      processed: 0,
    });
    expect(await waitlistRow(expired.id)).toMatchObject(renewal);
  });

  it("drops an expired invitation without inviting twice when its seat was already offered on", async () => {
    const { source } = fixture;
    // As a run that invited the next profile but died before the delete
    // leaves it.
    const expired = await addToWaitlist((await createUser("expired")).id, 1, {
      notifiedAt: new Date(Date.now() - 2 * DAY),
      expiresAt: new Date(Date.now() - DAY),
      notifiedForDetailId: source,
    });
    await addToWaitlist((await createUser("invited")).id, 2, invitedTo(source));
    const later = await addToWaitlist((await createUser("later")).id, 3);

    await processExpiredWaitlistNotifications();

    expect(await waitlistRow(expired.id)).toBeUndefined();
    expect((await waitlistRow(later.id))?.notifiedAt).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("passes a manual invitation on when staff changed the picked variant's category meanwhile", async () => {
    const { festivalId, source, target } = fixture;
    // Both variants have room; source is picked first.
    const waiting = await addToWaitlist((await createUser("waiting")).id, 1);

    const [result] = await behindLock(
      variantLock(source),
      1,
      () => [notifyWaitlistEntry(waiting.id, festivalId)],
      (client) =>
        client.query(
          "update festival_activity_details set category = 'gastronomy' where id = $1",
          [source],
        ),
    );

    expect(result).toEqual({
      success: true,
      message: "Notificación enviada correctamente",
    });
    expect((await waitlistRow(waiting.id))?.notifiedForDetailId).toBe(target);
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("leaves a waiter on the list when staff changed the variant's category during a bulk promotion", async () => {
    const { activityId, target } = fixture;
    const waiting = await addToWaitlist((await createUser("waiting")).id, 1);

    const [result] = await behindLock(
      variantLock(target),
      1,
      () => [promoteWaitlistToVariant(activityId, target)],
      (client) =>
        client.query(
          "update festival_activity_details set category = 'gastronomy' where id = $1",
          [target],
        ),
    );

    expect(result).toMatchObject({ success: true, promoted: 0, skipped: 1 });
    expect(await waitlistRow(waiting.id)).toBeDefined();
    expect(await activeIn(target)).toBe(0);
  });

  it("makes a stand vote wait for a move of any holder enrolled in the variant", async () => {
    const { festivalId, activityId, source, target } = fixture;
    await integrationDb!
      .update(festivalActivities)
      .set({
        allowsVoting: true,
        votingStartDate: new Date(Date.now() - DAY),
        votingEndDate: new Date(Date.now() + DAY),
      })
      .where(eq(festivalActivities.id, activityId));
    const [stand] = await integrationDb!
      .insert(stands)
      .values({ standNumber: 9201, festivalId })
      .returning({ id: stands.id });
    standIds.push(stand.id);
    const [reservation] = await integrationDb!
      .insert(standReservations)
      .values({ standId: stand.id, festivalId, status: "accepted" })
      .returning({ id: standReservations.id });
    // Two holders share the stand and are both enrolled, with designs.
    const holders = [];
    for (const label of ["first-holder", "second-holder"]) {
      const holder = await createUser(label);
      await integrationDb!
        .insert(reservationParticipants)
        .values({ userId: holder.id, reservationId: reservation.id });
      const row = await enroll(source, holder.id);
      await integrationDb!.insert(festivalActivityParticipantProofs).values({
        participationId: row.id,
        imageUrl: `https://example.test/${label}.png`,
      });
      holders.push(row);
    }
    currentProfile.mockResolvedValue(await createUser("voter"));

    // A move of the second holder holds its row while the vote validates
    // the stand. Locking only one holder would not wait for it.
    const [result] = await behindLock(
      {
        text: "select id from festival_activity_participants where id = $1 for update",
        values: [holders[1].id],
      },
      1,
      () => [
        addFestivalActivityVote({
          activityVariantId: source,
          votableType: "stand",
          standId: stand.id,
        }),
      ],
      (client) =>
        client.query(
          "update festival_activity_participants set details_id = $1 where id = $2",
          [target, holders[1].id],
        ),
    );

    // The first holder is still in the variant, so the vote stands.
    expect(result).toEqual({
      success: true,
      message: "Voto agregado correctamente",
    });
  });

  it("lets foreign-key writes into a variant through while its promotion sends the email", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    await addToWaitlist((await createUser("waiting")).id, 1);
    const bystander = await createUser("bystander");
    let insertError: unknown = "not attempted";
    sendEmail.mockImplementationOnce(async () => {
      // The promotion holds source through this send. A row pointing at
      // source checks the foreign key, which must not wait for it.
      const client = await pool!.connect();
      try {
        await client.query("begin");
        await client.query("set local lock_timeout = '1s'");
        await client.query(
          "insert into festival_activity_participants (details_id, user_id) values ($1, $2)",
          [source, bystander.id],
        );
        await client.query("commit");
        insertError = null;
      } catch (error) {
        await client.query("rollback");
        insertError = error;
      } finally {
        client.release();
      }
      return { data: { id: "email-1" }, error: null, headers: null };
    });

    const move = await moveActivityParticipant(row.id, target);

    expect(move.invitedName).toBe("waiting");
    expect(insertError).toBeNull();
  });

  it("refuses a best stand move into a variant where a stand partner holds the stand", async () => {
    const { festivalId } = fixture;
    const now = Date.now();
    const [activity] = await integrationDb!
      .insert(festivalActivities)
      .values({
        festivalId,
        name: "Mejor stand",
        type: "best_stand",
        registrationStartDate: new Date(now - DAY),
        registrationEndDate: new Date(now + DAY),
      })
      .returning({ id: festivalActivities.id });
    const first = await createVariant(activity.id, null, "illustration");
    const second = await createVariant(activity.id, null, "illustration");
    const third = await createVariant(activity.id, null, "illustration");
    const [stand] = await integrationDb!
      .insert(stands)
      .values({ standNumber: 9202, festivalId })
      .returning({ id: stands.id });
    standIds.push(stand.id);
    const [reservation] = await integrationDb!
      .insert(standReservations)
      .values({ standId: stand.id, festivalId, status: "accepted" })
      .returning({ id: standReservations.id });
    const partners = [];
    for (const [label, variant] of [
      ["partner-a", first],
      ["partner-b", second],
    ] as const) {
      const partner = await createUser(label);
      await integrationDb!
        .insert(reservationParticipants)
        .values({ userId: partner.id, reservationId: reservation.id });
      partners.push(await enroll(variant, partner.id));
    }

    const refused = await moveActivityParticipant(partners[1].id, first);

    expect(refused).toEqual({
      success: false,
      message:
        "Otro participante ya registró este stand en la variante de destino",
    });
    expect((await participation(partners[1].id)).detailsId).toBe(second);

    // A variant where nobody holds the stand takes the move.
    expect(await moveActivityParticipant(partners[1].id, third)).toMatchObject({
      success: true,
    });
  });

  it("lets a profile refused a seat an invitation holds join the waitlist", async () => {
    const { source, target, participant } = fixture;
    // A move frees source and invites the first waiter to it; target is full.
    const row = await enroll(source, participant.id);
    await addToWaitlist((await createUser("waiting")).id, 1);
    await enroll(target, (await createUser("seated")).id);
    expect((await moveActivityParticipant(row.id, target)).invitedName).toBe(
      "waiting",
    );
    const outsider = await createUser("outsider");

    expect(await enrollAs(outsider, source)).toEqual({
      success: false,
      message: RESERVED_MESSAGE,
    });
    expect(await enrollAs(outsider, target)).toEqual({
      success: false,
      message: "Ya no hay cupo disponible",
    });
    expect(await joinWaitlistAs(outsider)).toMatchObject({
      success: true,
      position: 2,
    });
  });

  it("lets a profile refused a raised limit's seat a waiter is owed join the waitlist", async () => {
    const { source, target } = fixture;
    await enroll(source, (await createUser("seated-1")).id);
    await enroll(target, (await createUser("seated-2")).id);
    await enroll(target, (await createUser("seated-3")).id);
    const waiting = await createUser("waiting");
    await addToWaitlist(waiting.id, 1);
    // Staff raise source's limit, which invites nobody.
    await integrationDb!
      .update(festivalActivityDetails)
      .set({ participationLimit: 2 })
      .where(eq(festivalActivityDetails.id, source));

    expect(await joinWaitlistAs(await createUser("outsider"))).toMatchObject({
      success: true,
      position: 2,
    });
  });

  it("still refuses the waitlist while a seat is open to the profile", async () => {
    expect(await joinWaitlistAs(await createUser("outsider"))).toEqual({
      success: false,
      message: "Todavía hay cupos disponibles en esta actividad",
    });
  });

  it("counts against a limit set while an enrolment into an unlimited variant waited for it", async () => {
    const { activityId } = fixture;
    const variant = await createVariant(activityId, null);
    await enroll(variant, (await createUser("seated")).id);
    const newcomer = await createUser("newcomer");

    const [result] = await behindLock(
      variantLock(variant),
      1,
      () => [enrollAs(newcomer, variant)],
      (client) =>
        client.query(
          "update festival_activity_details set participation_limit = 1 where id = $1",
          [variant],
        ),
    );

    expect(result).toEqual({
      success: false,
      message: "Ya no hay cupo disponible",
    });
    expect(await activeIn(variant)).toBe(1);
  });

  it("leaves the invitee's profile row unlocked while its promotion sends the email", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const waiting = await createUser("waiting");
    await addToWaitlist(waiting.id, 1);
    let lockError: unknown = "not attempted";
    sendEmail.mockImplementationOnce(async () => {
      // Any write referencing the invitee takes this lock on their row.
      try {
        await pool!.query(
          "select 1 from users where id = $1 for key share nowait",
          [waiting.id],
        );
        lockError = null;
      } catch (error) {
        lockError = error;
      }
      return { data: { id: "email-1" }, error: null, headers: null };
    });

    const move = await moveActivityParticipant(row.id, target);

    expect(move.invitedName).toBe("waiting");
    expect(lockError).toBeNull();
  });

  it("invites a waiter whose profile row someone else holds", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const waiting = await createUser("waiting");
    const entry = await addToWaitlist(waiting.id, 1);
    const client = await pool!.connect();
    try {
      await client.query("begin");
      await client.query("select 1 from users where id = $1 for key share", [
        waiting.id,
      ]);
      // Bounded, so a move that blocks on the held row fails the test and
      // still reaches the rollback below instead of hanging the suite.
      const move = await Promise.race([
        moveActivityParticipant(row.id, target),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("move blocked")), 5_000),
        ),
      ]);
      expect(move.invitedName).toBe("waiting");
    } finally {
      await client.query("rollback");
      client.release();
    }
    expect((await waitlistRow(entry.id))?.notifiedForDetailId).toBe(source);
  });

  it("offers every seat a raised limit freed, not only the first", async () => {
    const { activityId, participant } = fixture;
    const variant = await createVariant(activityId, 1);
    await enroll(variant, participant.id);
    const first = await addToWaitlist((await createUser("first")).id, 1);
    const second = await addToWaitlist((await createUser("second")).id, 2);
    const third = await addToWaitlist((await createUser("third")).id, 3);
    // Staff raise the limit by two, which invites nobody.
    await integrationDb!
      .update(festivalActivityDetails)
      .set({ participationLimit: 3 })
      .where(eq(festivalActivityDetails.id, variant));

    expect(await enrollAs(await createUser("outsider"), variant)).toEqual({
      success: false,
      message: RESERVED_MESSAGE,
    });

    expect((await waitlistRow(first.id))?.notifiedForDetailId).toBe(variant);
    expect((await waitlistRow(second.id))?.notifiedForDetailId).toBe(variant);
    expect((await waitlistRow(third.id))?.notifiedAt).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("neither invites nor seats a waitlist entry of a profile already enrolled", async () => {
    const { festivalId, source, target } = fixture;
    // An entry an enrolment from before this branch left behind.
    const enrolled = await createUser("enrolled");
    await enroll(target, enrolled.id);
    const stale = await addToWaitlist(enrolled.id, 1);

    expect(await notifyWaitlistEntry(stale.id, festivalId)).toEqual({
      success: false,
      message: "El participante ya está inscrito en esta actividad",
    });
    expect(sendEmail).not.toHaveBeenCalled();

    // Invited anyway (by an older run), it still cannot take a second seat.
    await integrationDb!
      .update(festivalActivityWaitlist)
      .set(invitedTo(source))
      .where(eq(festivalActivityWaitlist.id, stale.id));
    currentProfile.mockResolvedValue(enrolled);
    expect(
      await enrollFromWaitlistInvitation(enrolled.id, stale.id, festivalId),
    ).toEqual({
      success: false,
      message: "Ya estás inscrito en esta actividad",
    });
    expect(await activeIn(source)).toBe(0);
  });

  it("invites by the category the freed variant has under its lock", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    // An illustration profile waits; staff make source gastronomy-only while
    // the move's promotion waits for it.
    const waiting = await addToWaitlist((await createUser("waiting")).id, 1);

    const [move] = await behindLock(
      variantLock(source),
      1,
      () => [moveActivityParticipant(row.id, target)],
      (client) =>
        client.query(
          "update festival_activity_details set category = 'gastronomy' where id = $1",
          [source],
        ),
    );

    expect(move).toMatchObject({ success: true });
    expect(move.invitedName).toBeUndefined();
    expect((await waitlistRow(waiting.id))?.notifiedAt).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses a second participation in the same activity", async () => {
    const { source, target } = fixture;
    const enrolled = await createUser("enrolled");
    await enroll(source, enrolled.id);

    expect(await enrollAs(enrolled, target)).toEqual({
      success: false,
      message: "Ya estás inscrito en esta actividad",
    });
    expect(await activeIn(target)).toBe(0);
  });

  it("invites the waitlist to the seats a raised limit opens", async () => {
    const { festivalId, activityId, source, target, participant } = fixture;
    await enroll(source, participant.id);
    const first = await addToWaitlist((await createUser("first")).id, 1);
    const second = await addToWaitlist((await createUser("second")).id, 2);
    const now = Date.now();

    // Source goes from 1 to 2 seats; target is unchanged.
    const result = await updateFestivalActivity(activityId, festivalId, {
      name: "Cuponera",
      type: "coupon_book",
      accessLevel: "public",
      registrationStartDate: new Date(now - DAY),
      registrationEndDate: new Date(now + DAY),
      allowsVoting: false,
      waitlistWindowMinutes: 60,
      details: [
        { id: source, participationLimit: 2 },
        { id: target, participationLimit: 2 },
      ],
    });

    expect(result.success).toBe(true);
    expect((await waitlistRow(first.id))?.notifiedForDetailId).toBe(source);
    expect((await waitlistRow(second.id))?.notifiedAt).toBeNull();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("passes over a waiter who is no longer verified", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const suspended = await createUser("suspended");
    await integrationDb!
      .update(users)
      .set({ status: "pending" })
      .where(eq(users.id, suspended.id));
    const skipped = await addToWaitlist(suspended.id, 1);
    const next = await addToWaitlist((await createUser("next")).id, 2);

    const move = await moveActivityParticipant(row.id, target);

    expect(move.invitedName).toBe("next");
    expect((await waitlistRow(skipped.id))?.notifiedAt).toBeNull();
    expect((await waitlistRow(next.id))?.notifiedForDetailId).toBe(source);
  });

  it("refuses an undo after a removal and restore within the move's millisecond", async () => {
    const { source, target, participant } = fixture;
    const row = await enroll(source, participant.id);
    const move = await moveActivityParticipant(row.id, target);
    await integrationDb!
      .update(festivalActivityParticipants)
      .set({ removedAt: new Date(), removalReason: "x" })
      .where(eq(festivalActivityParticipants.id, row.id));
    // The restore runs on a clock reading the move's revision exactly.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(move.revision!));
    try {
      expect(await restoreActivityParticipant(row.id)).toMatchObject({
        success: true,
      });
    } finally {
      vi.useRealTimers();
    }

    const undo = await moveActivityParticipant(row.id, source, {
      expectedSourceDetailId: target,
      undo: undoOf(move),
    });

    expect(undo).toEqual({ success: false, message: STALE_MESSAGE });
  });
});
