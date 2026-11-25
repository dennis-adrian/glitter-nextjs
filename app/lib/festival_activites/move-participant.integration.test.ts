// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
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

import * as schema from "@/db/schema";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipantProofs,
  festivalActivityParticipants,
  festivalActivityWaitlist,
  festivals,
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

let moveActivityParticipant: (typeof import("@/app/lib/festival_activites/admin-actions"))["moveActivityParticipant"];

type UserRow = typeof users.$inferSelect;

const festivalIds: number[] = [];
const userIds: number[] = [];

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

    ({ moveActivityParticipant } = await import(
      "@/app/lib/festival_activites/admin-actions"
    ));
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
      activityId: activity.id,
      source: await createVariant(activity.id, 1),
      target: await createVariant(activity.id, 2),
      admin,
      participant: await createUser("participant"),
    };
  });

  afterEach(async () => {
    vi.clearAllMocks();
    const leftoverFestivals = festivalIds.splice(0);
    if (leftoverFestivals.length > 0) {
      await integrationDb!
        .delete(festivals)
        .where(inArray(festivals.id, leftoverFestivals));
    }
    const leftoverUsers = userIds.splice(0);
    if (leftoverUsers.length > 0) {
      await integrationDb!.delete(users).where(inArray(users.id, leftoverUsers));
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

    expect(result).toEqual({
      success: true,
      message: "Participante movido de variante",
    });
    expect((await participation(row.id)).detailsId).toBe(target);
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

    await moveActivityParticipant(row.id, target);

    const [invited] = await integrationDb!
      .select()
      .from(festivalActivityWaitlist)
      .where(eq(festivalActivityWaitlist.id, entry.id));
    expect(invited.notifiedForDetailId).toBe(source);
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
