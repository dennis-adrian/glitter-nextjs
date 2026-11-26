// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NextRequest } from "next/server";
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
  festivalActivityCouponBookConfigs,
  festivalActivityDetails,
  festivalActivityParticipantProofs,
  festivalActivityParticipants,
  festivals,
  users,
} from "@/db/schema";
import type { CouponBookDraft } from "@/app/lib/festival_activites/coupon-book-draft";

/**
 * A coupon-book draft saved before an admin moves a participant to another
 * variant must not print that coupon in the old variant's book: the saved
 * draft keeps the variant each coupon was captured from, the export route
 * refuses a stale draft, and relocating the coupon makes it exportable again.
 */

const { currentProfile, sendEmail, generateDraftCouponBookPdf } = vi.hoisted(
  () => ({
    currentProfile: vi.fn(),
    sendEmail: vi.fn(),
    generateDraftCouponBookPdf: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn(), NextRequest: Request }));
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
  requireAdminOrFestivalAdmin: vi.fn(async () => true),
  requireProfileOwnerOrAdmin: vi.fn(),
}));
// The PDF itself is rendered by a headless browser; the test only needs the
// draft the route would hand to it.
vi.mock("@/app/lib/festival_activites/coupon-book-export", () => ({
  generateCouponBookPdf: vi.fn(),
  generateDraftCouponBookPdf,
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

type Modules = {
  moveActivityParticipant: (typeof import("@/app/lib/festival_activites/admin-actions"))["moveActivityParticipant"];
  fetchFestivalActivityForReview: (typeof import("@/app/lib/festivals/actions"))["fetchFestivalActivityForReview"];
  config: typeof import("@/app/lib/festival_activites/coupon-book-config-actions");
  builder: typeof import("@/app/lib/festival_activites/coupon-book-builder");
  draftLib: typeof import("@/app/lib/festival_activites/coupon-book-draft");
  reconciliation: typeof import("@/app/lib/festival_activites/coupon-book-reconciliation");
  exportRoute: typeof import("@/app/api/festival_activities/[activityId]/couponbook/export/route");
};

let modules: Modules;

const festivalIds: number[] = [];
const userIds: number[] = [];

async function createUser(label: string, role: "user" | "admin" = "user") {
  const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `coupon-draft-${suffix}`,
      email: `coupon-draft-${suffix}@example.test`,
      displayName: label,
      role,
      status: "verified",
      category: "illustration",
    })
    .returning();
  userIds.push(user.id);
  return user;
}

async function createVariant(activityId: number, description: string) {
  const [variant] = await integrationDb!
    .insert(festivalActivityDetails)
    .values({ activityId, participationLimit: 2, description })
    .returning({ id: festivalActivityDetails.id });
  return variant.id;
}

async function enrollWithCoupon(detailsId: number, name: string) {
  const user = await createUser(name);
  const [row] = await integrationDb!
    .insert(festivalActivityParticipants)
    .values({ detailsId, userId: user.id })
    .returning();
  await integrationDb!.insert(festivalActivityParticipantProofs).values({
    participationId: row.id,
    proofStatus: "approved",
    promoDescription: `Promo de ${name}`,
  });
  return row.id;
}

let fixture: {
  festivalId: number;
  activityId: number;
  variantA: number;
  variantB: number;
  ana: number;
  bruno: number;
  carla: number;
  adminId: number;
};

async function liveActivity() {
  const activity = await modules.fetchFestivalActivityForReview(
    fixture.festivalId,
    fixture.activityId,
  );
  if (!activity) throw new Error("activity not found");
  return activity;
}

async function saveDraftFromLiveData(transform = (d: CouponBookDraft) => d) {
  const activity = await liveActivity();
  const draft = transform(
    modules.draftLib.buildInitialCouponBookDraft({
      festivalId: fixture.festivalId,
      activityId: fixture.activityId,
      variants: modules.builder.buildCouponBookVariants(activity),
    }),
  );
  const result = await modules.config.saveCouponBookConfig({
    activityId: fixture.activityId,
    draft,
    userId: fixture.adminId,
    validParticipationIds: new Set([fixture.ana, fixture.bruno, fixture.carla]),
    expectedRevision: null,
  });
  expect(result.ok).toBe(true);
}

function postExport(draft: CouponBookDraft) {
  const request = new Request(
    `http://localhost/api/festival_activities/${fixture.activityId}/couponbook/export`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, exportScope: { type: "all" } }),
    },
  ) as unknown as NextRequest;
  return modules.exportRoute.POST(request, {
    params: Promise.resolve({ activityId: String(fixture.activityId) }),
  });
}

function couponsInBook(draft: CouponBookDraft, detailId: number) {
  const book = draft.books.find((item) => item.sourceDetailId === detailId)!;
  return modules.draftLib
    .getDraftBookPages(draft, book.id)
    .flatMap((page) => page.slotCouponIds)
    .filter((id): id is string => id !== null);
}

describeDatabase("coupon-book drafts saved before a variant move", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    modules = {
      moveActivityParticipant: (
        await import("@/app/lib/festival_activites/admin-actions")
      ).moveActivityParticipant,
      fetchFestivalActivityForReview: (
        await import("@/app/lib/festivals/actions")
      ).fetchFestivalActivityForReview,
      config: await import(
        "@/app/lib/festival_activites/coupon-book-config-actions"
      ),
      builder: await import("@/app/lib/festival_activites/coupon-book-builder"),
      draftLib: await import("@/app/lib/festival_activites/coupon-book-draft"),
      reconciliation: await import(
        "@/app/lib/festival_activites/coupon-book-reconciliation"
      ),
      exportRoute: await import(
        "@/app/api/festival_activities/[activityId]/couponbook/export/route"
      ),
    };
  }, 60_000);

  beforeEach(async () => {
    sendEmail.mockResolvedValue({
      data: { id: "email-1" },
      error: null,
      headers: null,
    });
    generateDraftCouponBookPdf.mockImplementation(
      async () => new Response("%PDF", { status: 200 }),
    );

    const [festival] = await integrationDb!
      .insert(festivals)
      .values({
        name: `Coupon draft moves ${Date.now()}`,
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

    const admin = await createUser("admin", "admin");
    currentProfile.mockResolvedValue(admin);

    const variantA = await createVariant(activity.id, "Libro A");
    const variantB = await createVariant(activity.id, "Libro B");
    fixture = {
      festivalId: festival.id,
      activityId: activity.id,
      variantA,
      variantB,
      ana: await enrollWithCoupon(variantA, "Ana"),
      bruno: await enrollWithCoupon(variantA, "Bruno"),
      carla: await enrollWithCoupon(variantB, "Carla"),
      adminId: admin.id,
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
      await integrationDb!
        .delete(users)
        .where(inArray(users.id, leftoverUsers));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("keeps each coupon's variant through a save and reload", async () => {
    await saveDraftFromLiveData();

    const saved = await modules.config.fetchSavedCouponBookConfig(
      fixture.activityId,
    );

    expect(saved.draft?.entries[`participant-${fixture.bruno}`]).toMatchObject(
      { sourceDetailId: fixture.variantA },
    );
    expect(saved.draft?.entries[`participant-${fixture.carla}`]).toMatchObject(
      { sourceDetailId: fixture.variantB },
    );
  });

  it("refuses to export a stale draft, then exports it once the coupon is relocated", async () => {
    await saveDraftFromLiveData();
    const move = await modules.moveActivityParticipant(
      fixture.bruno,
      fixture.variantB,
    );
    expect(move.success).toBe(true);

    const saved = await modules.config.fetchSavedCouponBookConfig(
      fixture.activityId,
    );
    const stale = saved.draft!;
    expect(couponsInBook(stale, fixture.variantA)).toContain(
      `participant-${fixture.bruno}`,
    );

    const refused = await postExport(stale);
    expect(refused.status).toBe(409);
    const body = (await refused.json()) as { error: string };
    expect(body.error).toBe(
      "El borrador está desactualizado. Cambiaron de variante: Bruno (Libro A → Libro B). Actualizá la cuponera antes de exportar.",
    );
    expect(generateDraftCouponBookPdf).not.toHaveBeenCalled();

    const assignments =
      modules.builder.buildCouponBookParticipantAssignments(
        await liveActivity(),
      );
    const { draft: fixed, unresolved } =
      modules.reconciliation.relocateMovedCoupons(stale, assignments);
    expect(unresolved).toEqual([]);

    const exported = await postExport(fixed);
    expect(exported.status).toBe(200);
    expect(generateDraftCouponBookPdf).toHaveBeenCalledTimes(1);
    const printed = generateDraftCouponBookPdf.mock.calls[0][0]
      .draft as CouponBookDraft;
    expect(couponsInBook(printed, fixture.variantA)).toEqual([
      `participant-${fixture.ana}`,
    ]);
    expect(couponsInBook(printed, fixture.variantB)).toEqual([
      `participant-${fixture.carla}`,
      `participant-${fixture.bruno}`,
    ]);
  });

  it("flags a draft saved before variants were recorded, from the coupon's book", async () => {
    await saveDraftFromLiveData((draft) => ({
      ...draft,
      entries: Object.fromEntries(
        Object.entries(draft.entries).map(([id, entry]) => {
          const legacy = { ...entry };
          delete legacy.sourceDetailId;
          return [id, legacy];
        }),
      ),
    }));
    const [row] = await integrationDb!
      .select({ payload: festivalActivityCouponBookConfigs.payload })
      .from(festivalActivityCouponBookConfigs)
      .where(eq(festivalActivityCouponBookConfigs.activityId, fixture.activityId));
    expect(
      JSON.stringify((row.payload as CouponBookDraft).entries),
    ).not.toContain("sourceDetailId");

    await modules.moveActivityParticipant(fixture.bruno, fixture.variantB);

    const saved = await modules.config.fetchSavedCouponBookConfig(
      fixture.activityId,
    );
    const audit = modules.reconciliation.auditCouponBookDraft(
      saved.draft!,
      modules.builder.buildCouponBookParticipantAssignments(
        await liveActivity(),
      ),
    );
    expect(audit.moved).toEqual([
      expect.objectContaining({
        participationId: fixture.bruno,
        currentDetailId: fixture.variantB,
        inferred: true,
      }),
    ]);
    expect((await postExport(saved.draft!)).status).toBe(409);
  });

  it("refuses a draft that still prints a removed participant", async () => {
    await saveDraftFromLiveData();
    await integrationDb!
      .update(festivalActivityParticipants)
      .set({ removedAt: new Date(), removalReason: "Baja" })
      .where(eq(festivalActivityParticipants.id, fixture.ana));

    const saved = await modules.config.fetchSavedCouponBookConfig(
      fixture.activityId,
    );
    const refused = await postExport(saved.draft!);

    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: string }).error).toContain(
      "Ya no participan: Ana",
    );
  });

  it("refuses a draft missing a participant who joined since it was saved", async () => {
    await saveDraftFromLiveData();
    await enrollWithCoupon(fixture.variantB, "Dario");

    const saved = await modules.config.fetchSavedCouponBookConfig(
      fixture.activityId,
    );
    const refused = await postExport(saved.draft!);

    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: string }).error).toContain(
      "Se sumaron y no tienen cupón: Dario (Libro B)",
    );
  });
});
