// @vitest-environment node

import { and, eq, inArray } from "drizzle-orm";
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
  vi,
} from "vitest";

import type { BaseProfile } from "@/app/api/users/definitions";
import type {
  ActivityDetailsWithParticipants,
  FestivalActivity,
} from "@/app/lib/festivals/definitions";
import * as schema from "@/db/schema";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipants,
  festivalActivityWaitlist,
  festivals,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

/**
 * A removal from one variant bars the profile from the whole activity: no
 * enrolling in another variant, no taking a waitlist slot, and no invitation
 * to one. Runs the real queries, since the promotion claim is raw SQL.
 */

const { currentProfile, sendEmail } = vi.hoisted(() => ({
  currentProfile: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail }));
vi.mock("@/app/emails/festival-activity-registration", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/app/emails/activity-waitlist-invitation", () => ({
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

const REMOVED_MESSAGE =
  "No podés volver a inscribirte después de haber sido removido";
const DAY = 24 * 60 * 60 * 1000;

type Actions = typeof import("@/app/lib/festival_activites/actions");
let enrollInActivity: Actions["enrollInActivity"];
let enrollFromWaitlistInvitation: Actions["enrollFromWaitlistInvitation"];
let enrollInBestStandActivity: Actions["enrollInBestStandActivity"];
let notifyWaitlistEntry: (typeof import("@/app/lib/festival_activites/admin-actions"))["notifyWaitlistEntry"];
let promoteFromWaitlist: (typeof import("@/app/lib/festival_activites/waitlist-promotion"))["promoteFromWaitlist"];
let wasRemovedFromActivity: (typeof import("@/app/lib/festival_activites/queries"))["wasRemovedFromActivity"];

type UserRow = typeof users.$inferSelect;

let fixture: {
  festivalId: number;
  activityId: number;
  otherActivityId: number;
  variantA: number;
  variantB: number;
  unlimitedVariant: number;
  removed: UserRow;
  other: UserRow;
  admin: UserRow;
};

const festivalIds: number[] = [];
const userIds: number[] = [];

async function createUser(label: string, role: "user" | "admin" = "user") {
  const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `removed-participants-${suffix}`,
      email: `removed-participants-${suffix}@example.test`,
      displayName: label,
      role,
      status: "verified",
      category: "illustration",
    })
    .returning();
  userIds.push(user.id);
  return user;
}

async function createActivity(festivalId: number, name: string) {
  const now = Date.now();
  const [activity] = await integrationDb!
    .insert(festivalActivities)
    .values({
      festivalId,
      name,
      type: "sticker_print",
      registrationStartDate: new Date(now - DAY),
      registrationEndDate: new Date(now + DAY),
      waitlistWindowMinutes: 60,
    })
    .returning({ id: festivalActivities.id });
  return activity.id;
}

async function createVariant(activityId: number, participationLimit: number | null) {
  const [variant] = await integrationDb!
    .insert(festivalActivityDetails)
    .values({ activityId, participationLimit })
    .returning({ id: festivalActivityDetails.id });
  return variant.id;
}

async function participantRows(detailsId: number, userId: number) {
  return integrationDb!
    .select()
    .from(festivalActivityParticipants)
    .where(
      and(
        eq(festivalActivityParticipants.detailsId, detailsId),
        eq(festivalActivityParticipants.userId, userId),
      ),
    );
}

async function addToWaitlist(
  activityId: number,
  userId: number,
  position: number,
  invitedTo?: number,
) {
  const [entry] = await integrationDb!
    .insert(festivalActivityWaitlist)
    .values({
      activityId,
      userId,
      position,
      ...(invitedTo
        ? {
            notifiedAt: new Date(),
            expiresAt: new Date(Date.now() + DAY),
            notifiedForDetailId: invitedTo,
          }
        : {}),
    })
    .returning();
  return entry;
}

describeDatabase("a removal bars the whole activity", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({
      enrollInActivity,
      enrollFromWaitlistInvitation,
      enrollInBestStandActivity,
    } = await import("@/app/lib/festival_activites/actions"));
    ({ notifyWaitlistEntry } = await import(
      "@/app/lib/festival_activites/admin-actions"
    ));
    ({ promoteFromWaitlist } = await import(
      "@/app/lib/festival_activites/waitlist-promotion"
    ));
    ({ wasRemovedFromActivity } = await import(
      "@/app/lib/festival_activites/queries"
    ));

    const result = await pool!.query<{ table: string | null }>(
      "select to_regclass('public.festival_activity_waitlist')::text as table",
    );
    if (!result.rows[0]?.table) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
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
        name: `Removed participants ${Date.now()}`,
        status: "active",
        festivalType: "glitter",
      })
      .returning({ id: festivals.id });
    festivalIds.push(festival.id);

    const activityId = await createActivity(festival.id, "Sticker print");
    const otherActivityId = await createActivity(festival.id, "Otra actividad");
    const variantA = await createVariant(activityId, 1);
    const variantB = await createVariant(activityId, 5);
    const unlimitedVariant = await createVariant(activityId, null);

    const removed = await createUser("removed");
    const other = await createUser("other");
    const admin = await createUser("admin", "admin");

    // Staff removed `removed` from variant A; `other` holds A's only slot.
    await integrationDb!.insert(festivalActivityParticipants).values([
      {
        detailsId: variantA,
        userId: removed.id,
        removedAt: new Date(),
        removalReason: "Diseño fuera de las bases",
      },
      { detailsId: variantA, userId: other.id },
    ]);

    fixture = {
      festivalId: festival.id,
      activityId,
      otherActivityId,
      variantA,
      variantB,
      unlimitedVariant,
      removed,
      other,
      admin,
    };
  });

  afterEach(async () => {
    vi.clearAllMocks();
    const db = integrationDb!;
    // Activities, variants, participants and waitlist entries cascade.
    const leftoverFestivals = festivalIds.splice(0);
    if (leftoverFestivals.length > 0) {
      await db.delete(festivals).where(inArray(festivals.id, leftoverFestivals));
    }
    const leftoverUsers = userIds.splice(0);
    if (leftoverUsers.length > 0) {
      await db.delete(users).where(inArray(users.id, leftoverUsers));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("sees a removal in any variant of the activity, and only that", async () => {
    const db = integrationDb!;
    const { activityId, otherActivityId, removed, other } = fixture;

    expect(await wasRemovedFromActivity(db, activityId, removed.id)).toBe(true);
    expect(await wasRemovedFromActivity(db, otherActivityId, removed.id)).toBe(
      false,
    );
    expect(await wasRemovedFromActivity(db, activityId, other.id)).toBe(false);
  });

  it("refuses to enroll a removed profile in another variant", async () => {
    const { festivalId, activityId, variantB, unlimitedVariant, removed } =
      fixture;
    currentProfile.mockResolvedValue(removed);

    for (const variantId of [variantB, unlimitedVariant]) {
      const result = await enrollInActivity(
        removed as BaseProfile,
        festivalId,
        { id: variantId } as ActivityDetailsWithParticipants,
        { id: activityId } as FestivalActivity,
      );

      expect(result).toEqual({ success: false, message: REMOVED_MESSAGE });
      expect(await participantRows(variantId, removed.id)).toEqual([]);
    }
  });

  it("still enrolls a profile nobody removed", async () => {
    const { festivalId, activityId, unlimitedVariant } = fixture;
    const newcomer = await createUser("newcomer");
    currentProfile.mockResolvedValue(newcomer);

    const result = await enrollInActivity(
      newcomer as BaseProfile,
      festivalId,
      { id: unlimitedVariant } as ActivityDetailsWithParticipants,
      { id: activityId } as FestivalActivity,
    );

    expect(result).toMatchObject({ success: true });
    expect(await participantRows(unlimitedVariant, newcomer.id)).toHaveLength(1);
  });

  it("refuses a waitlist invitation to another variant", async () => {
    const { festivalId, activityId, variantB, removed } = fixture;
    currentProfile.mockResolvedValue(removed);
    const entry = await addToWaitlist(activityId, removed.id, 1, variantB);

    const result = await enrollFromWaitlistInvitation(
      removed.id,
      entry.id,
      festivalId,
    );

    expect(result).toEqual({ success: false, message: REMOVED_MESSAGE });
    expect(await participantRows(variantB, removed.id)).toEqual([]);
  });

  it("skips a removed profile when promoting the waitlist", async () => {
    const { activityId, variantA, removed } = fixture;
    const next = await createUser("next");
    const removedEntry = await addToWaitlist(activityId, removed.id, 1);
    const nextEntry = await addToWaitlist(activityId, next.id, 2);

    await promoteFromWaitlist(activityId, variantA);

    const entries = await integrationDb!
      .select()
      .from(festivalActivityWaitlist)
      .where(eq(festivalActivityWaitlist.activityId, activityId));
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    expect(byId.get(removedEntry.id)?.notifiedAt).toBeNull();
    expect(byId.get(nextEntry.id)).toMatchObject({
      notifiedForDetailId: variantA,
    });
    expect(byId.get(nextEntry.id)?.notifiedAt).not.toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: [next.email] });
  });

  it("refuses a best stand entry after a removal", async () => {
    const db = integrationDb!;
    const { festivalId, removed } = fixture;
    currentProfile.mockResolvedValue(removed);

    const [activity] = await db
      .insert(festivalActivities)
      .values({
        festivalId,
        name: "Mejor stand",
        type: "best_stand",
        registrationStartDate: new Date(Date.now() - DAY),
        registrationEndDate: new Date(Date.now() + DAY),
      })
      .returning({ id: festivalActivities.id });
    const [variant] = await db
      .insert(festivalActivityDetails)
      .values({ activityId: activity.id, category: "illustration" })
      .returning({ id: festivalActivityDetails.id });
    await db.insert(festivalActivityParticipants).values({
      detailsId: variant.id,
      userId: removed.id,
      removedAt: new Date(),
    });
    const [stand] = await db
      .insert(stands)
      .values({ standNumber: 9100, festivalId })
      .returning({ id: stands.id });
    const [reservation] = await db
      .insert(standReservations)
      .values({ standId: stand.id, festivalId, status: "accepted" })
      .returning({ id: standReservations.id });
    await db
      .insert(reservationParticipants)
      .values({ userId: removed.id, reservationId: reservation.id });

    const result = await enrollInBestStandActivity(
      activity.id,
      removed.id,
      festivalId,
      removed.category,
    );

    expect(result).toEqual({ success: false, message: REMOVED_MESSAGE });
  });

  it("refuses a staff invitation for a removed profile", async () => {
    const { festivalId, activityId, removed, admin } = fixture;
    currentProfile.mockResolvedValue(admin);
    const entry = await addToWaitlist(activityId, removed.id, 1);

    const result = await notifyWaitlistEntry(entry.id, festivalId);

    expect(result).toEqual({
      success: false,
      message:
        "El participante fue removido de esta actividad. Restauralo desde la lista de participantes.",
    });
    const [unchanged] = await integrationDb!
      .select()
      .from(festivalActivityWaitlist)
      .where(eq(festivalActivityWaitlist.id, entry.id));
    expect(unchanged.notifiedAt).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
