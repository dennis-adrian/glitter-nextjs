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
  users,
} from "@/db/schema";

/**
 * Draft activities: created hidden, invisible to participants and closed to
 * enrolment and the waitlist until staff publish them, and only hidden again
 * while nobody has taken part. Runs the real queries and locks.
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

const DAY = 24 * 60 * 60 * 1000;

type Actions = typeof import("@/app/lib/festival_activites/actions");
type AdminActions = typeof import("@/app/lib/festival_activites/admin-actions");
let enrollInActivity: Actions["enrollInActivity"];
let joinActivityWaitlist: Actions["joinActivityWaitlist"];
let createFestivalActivity: AdminActions["createFestivalActivity"];
let setFestivalActivityVisibility: AdminActions["setFestivalActivityVisibility"];
let fetchFestivalActivitiesByFestivalId: (typeof import("@/app/lib/festivals/queries"))["fetchFestivalActivitiesByFestivalId"];
let fetchFestivalActivity: (typeof import("@/app/lib/festival_activites/queries"))["fetchFestivalActivity"];

type UserRow = typeof users.$inferSelect;

let fixture: {
  festivalId: number;
  activityId: number;
  variantId: number;
  participant: UserRow;
  admin: UserRow;
};

const festivalIds: number[] = [];
const userIds: number[] = [];

async function createUser(label: string, role: "user" | "admin" = "user") {
  const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `activity-visibility-${suffix}`,
      email: `activity-visibility-${suffix}@example.test`,
      displayName: label,
      role,
      status: "verified",
      category: "illustration",
    })
    .returning();
  userIds.push(user.id);
  return user;
}

async function isVisible(activityId: number) {
  const [row] = await integrationDb!
    .select({ isVisible: festivalActivities.isVisible })
    .from(festivalActivities)
    .where(eq(festivalActivities.id, activityId));
  return row.isVisible;
}

function enroll(profile: UserRow) {
  return enrollInActivity(
    profile as BaseProfile,
    fixture.festivalId,
    { id: fixture.variantId } as ActivityDetailsWithParticipants,
    { id: fixture.activityId } as FestivalActivity,
  );
}

/**
 * Resolves once some backend waits on a row lock with a statement matching
 * `pattern`, so a test can let the other transaction go on knowing it is
 * blocked rather than merely not started.
 */
async function waitForLockWaiter(pattern: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { rows } = await pool!.query<{ waiting: number }>(
      `select count(*)::int as waiting from pg_stat_activity
       where datname = current_database()
         and wait_event_type = 'Lock'
         and query ilike $1`,
      [pattern],
    );
    if (rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No backend waited on a lock for ${pattern}`);
}

describeDatabase("draft festival activities", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ enrollInActivity, joinActivityWaitlist } =
      await import("@/app/lib/festival_activites/actions"));
    ({ createFestivalActivity, setFestivalActivityVisibility } =
      await import("@/app/lib/festival_activites/admin-actions"));
    ({ fetchFestivalActivitiesByFestivalId } =
      await import("@/app/lib/festivals/queries"));
    ({ fetchFestivalActivity } =
      await import("@/app/lib/festival_activites/queries"));

    const result = await pool!.query<{ column: string | null }>(
      `select column_name as column from information_schema.columns
       where table_name = 'festival_activities' and column_name = 'is_visible'`,
    );
    if (!result.rows[0]?.column) {
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
        name: `Activity visibility ${Date.now()}`,
        status: "active",
        festivalType: "glitter",
        // Out of the automatic "reservations open" scan other suites run.
        reservationsOpenNoticeAuto: false,
      })
      .returning({ id: festivals.id });
    festivalIds.push(festival.id);

    const admin = await createUser("admin", "admin");
    const participant = await createUser("participant");
    currentProfile.mockResolvedValue(admin);

    const now = Date.now();
    const created = await createFestivalActivity(festival.id, {
      name: "Sticker print",
      type: "sticker_print",
      accessLevel: "public",
      registrationStartDate: new Date(now - DAY),
      registrationEndDate: new Date(now + DAY),
      proofType: "image",
      proofUploadLimitDate: new Date(now + 2 * DAY),
      allowsVoting: false,
      waitlistWindowMinutes: 60,
      details: [{ participationLimit: 1 }],
    });
    expect(created).toMatchObject({ success: true });

    const [variant] = await integrationDb!
      .select({ id: festivalActivityDetails.id })
      .from(festivalActivityDetails)
      .where(eq(festivalActivityDetails.activityId, created.activityId!));

    fixture = {
      festivalId: festival.id,
      activityId: created.activityId!,
      variantId: variant.id,
      participant,
      admin,
    };
  });

  afterEach(async () => {
    vi.clearAllMocks();
    const db = integrationDb!;
    // Activities, variants, participants and waitlist entries cascade.
    const leftoverFestivals = festivalIds.splice(0);
    if (leftoverFestivals.length > 0) {
      await db
        .delete(festivals)
        .where(inArray(festivals.id, leftoverFestivals));
    }
    const leftoverUsers = userIds.splice(0);
    if (leftoverUsers.length > 0) {
      await db.delete(users).where(inArray(users.id, leftoverUsers));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("creates the activity as a draft that participants cannot see", async () => {
    const { festivalId, activityId, participant, admin } = fixture;

    expect(await isVisible(activityId)).toBe(false);
    expect(await fetchFestivalActivitiesByFestivalId(festivalId)).toEqual([]);

    currentProfile.mockResolvedValue(participant);
    expect(await fetchFestivalActivity(activityId)).toBeNull();

    currentProfile.mockResolvedValue(admin);
    expect(await fetchFestivalActivity(activityId)).toMatchObject({
      id: activityId,
      isVisible: false,
    });
  });

  it("refuses enrolment and the waitlist while it is a draft", async () => {
    const { activityId, variantId, participant } = fixture;
    currentProfile.mockResolvedValue(participant);

    expect(await enroll(participant)).toEqual({
      success: false,
      message: "Actividad no encontrada",
    });
    expect(
      await joinActivityWaitlist(participant as BaseProfile, activityId),
    ).toEqual({ success: false, message: "La actividad no existe" });

    expect(
      await integrationDb!
        .select()
        .from(festivalActivityParticipants)
        .where(eq(festivalActivityParticipants.detailsId, variantId)),
    ).toEqual([]);
    expect(
      await integrationDb!
        .select()
        .from(festivalActivityWaitlist)
        .where(eq(festivalActivityWaitlist.activityId, activityId)),
    ).toEqual([]);
  });

  it("opens the activity once staff publish it", async () => {
    const { festivalId, activityId, participant } = fixture;

    expect(
      await setFestivalActivityVisibility(activityId, festivalId, true),
    ).toEqual({ success: true, message: "Actividad publicada" });
    expect(await isVisible(activityId)).toBe(true);
    expect(await fetchFestivalActivitiesByFestivalId(festivalId)).toHaveLength(
      1,
    );

    currentProfile.mockResolvedValue(participant);
    expect(await enroll(participant)).toMatchObject({ success: true });
  });

  it("hides a published activity nobody has joined", async () => {
    const { festivalId, activityId } = fixture;
    await setFestivalActivityVisibility(activityId, festivalId, true);

    expect(
      await setFestivalActivityVisibility(activityId, festivalId, false),
    ).toMatchObject({ success: true });
    expect(await isVisible(activityId)).toBe(false);
  });

  it("refuses to hide an activity with a participant, even a removed one", async () => {
    const { festivalId, activityId, variantId, participant } = fixture;
    await setFestivalActivityVisibility(activityId, festivalId, true);
    await integrationDb!.insert(festivalActivityParticipants).values({
      detailsId: variantId,
      userId: participant.id,
      removedAt: new Date(),
    });

    expect(
      await setFestivalActivityVisibility(activityId, festivalId, false),
    ).toMatchObject({ success: false });
    expect(await isVisible(activityId)).toBe(true);
  });

  it("refuses to hide an activity with a waitlist entry", async () => {
    const { festivalId, activityId, participant } = fixture;
    await setFestivalActivityVisibility(activityId, festivalId, true);
    await integrationDb!.insert(festivalActivityWaitlist).values({
      activityId,
      userId: participant.id,
      position: 1,
    });

    expect(
      await setFestivalActivityVisibility(activityId, festivalId, false),
    ).toMatchObject({ success: false });
    expect(await isVisible(activityId)).toBe(true);
  });

  it("waits for an enrolment in progress and then refuses to hide", async () => {
    const { festivalId, activityId, variantId, participant } = fixture;
    await setFestivalActivityVisibility(activityId, festivalId, true);

    // An enrolment that has read the activity published, as
    // `isActivityVisible` does, and has not committed its seat yet.
    const enrolment = await pool!.connect();
    try {
      await enrolment.query("begin");
      await enrolment.query(
        "select is_visible from festival_activities where id = $1 for key share",
        [activityId],
      );

      const hiding = setFestivalActivityVisibility(
        activityId,
        festivalId,
        false,
      );
      await waitForLockWaiter("%festival_activities%for update%");

      await enrolment.query(
        "insert into festival_activity_participants (details_id, user_id) values ($1, $2)",
        [variantId, participant.id],
      );
      await enrolment.query("commit");

      expect(await hiding).toMatchObject({ success: false });
      expect(await isVisible(activityId)).toBe(true);
    } finally {
      enrolment.release();
    }
  });

  it("makes an enrolment that waited on a hide see the draft", async () => {
    const { festivalId, activityId, variantId, participant } = fixture;
    await setFestivalActivityVisibility(activityId, festivalId, true);
    // A variant added after the activity was published: hiding covers it,
    // since it locks the activity rather than the variants it can see.
    const [newVariant] = await integrationDb!
      .insert(festivalActivityDetails)
      .values({ activityId, participationLimit: 5 })
      .returning({ id: festivalActivityDetails.id });

    // A hide that has locked the activity and not committed yet.
    const hide = await pool!.connect();
    try {
      await hide.query("begin");
      await hide.query(
        "select id from festival_activities where id = $1 for update",
        [activityId],
      );
      await hide.query(
        "update festival_activities set is_visible = false where id = $1",
        [activityId],
      );

      currentProfile.mockResolvedValue(participant);
      const enrolling = enrollInActivity(
        participant as BaseProfile,
        festivalId,
        { id: newVariant.id } as ActivityDetailsWithParticipants,
        { id: activityId } as FestivalActivity,
      );
      await waitForLockWaiter("%festival_activities%for key share%");
      await hide.query("commit");

      expect(await enrolling).toEqual({
        success: false,
        message: "Actividad no encontrada",
      });
    } finally {
      hide.release();
    }

    expect(
      await integrationDb!
        .select()
        .from(festivalActivityParticipants)
        .where(
          inArray(festivalActivityParticipants.detailsId, [
            variantId,
            newVariant.id,
          ]),
        ),
    ).toEqual([]);
  });

  it("refuses a participant and an activity of another festival", async () => {
    const { festivalId, activityId, participant } = fixture;

    currentProfile.mockResolvedValue(participant);
    expect(
      await setFestivalActivityVisibility(activityId, festivalId, true),
    ).toMatchObject({ success: false });

    currentProfile.mockResolvedValue(fixture.admin);
    expect(
      await setFestivalActivityVisibility(activityId, festivalId + 1, true),
    ).toEqual({ success: false, message: "Actividad no encontrada" });
    expect(await isVisible(activityId)).toBe(false);
  });
});
