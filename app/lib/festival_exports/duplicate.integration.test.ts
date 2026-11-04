// @vitest-environment node

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  festivalDates,
  festivalReservationFeatures,
  festivalSectors,
  festivalStatusEvents,
  festivals,
  standGroups,
  standSubcategories,
  stands,
  subcategories,
  users,
} from "@/db/schema";

const requireAdminOrFestivalAdmin = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("@/app/lib/festivals/active-festival-cache", () => ({
  expireFestivalCaches: vi.fn(),
}));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdminOrFestivalAdmin }));

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

type Actions = typeof import("@/app/lib/festival_exports/actions");
let duplicateFestival: Actions["duplicateFestival"];
let exportFestivalData: Actions["exportFestivalData"];
let importFestivalData: Actions["importFestivalData"];
let createFestivalFromImport: Actions["createFestivalFromImport"];

const festivalIds: number[] = [];
const subcategoryIds: number[] = [];
let adminId: number;

/**
 * A festival with one sector holding a priced full table, a loose stand with a
 * subcategory, and reservation features configured.
 */
async function seedSource() {
  const db = integrationDb!;
  const tag = randomUUID();
  const [festival] = await db
    .insert(festivals)
    .values({ name: `dup-source-${tag}`, reservationHoldMinutes: 12 })
    .returning({ id: festivals.id, name: festivals.name });
  festivalIds.push(festival!.id);

  await db.insert(festivalDates).values({
    festivalId: festival!.id,
    startDate: new Date("2027-03-01T14:00:00.000Z"),
    endDate: new Date("2027-03-01T22:00:00.000Z"),
  });
  await db.insert(festivalReservationFeatures).values([
    {
      festivalId: festival!.id,
      type: "full_table",
      category: "illustration",
      enabled: true,
      creditPrice: 15,
    },
    {
      festivalId: festival!.id,
      type: "late_partner",
      enabled: false,
      creditPrice: 4.5,
      deadlineOverrideAt: new Date("2027-02-01T00:00:00.000Z"),
    },
  ]);

  const [sector] = await db
    .insert(festivalSectors)
    .values({ festivalId: festival!.id, name: "Planta baja" })
    .returning({ id: festivalSectors.id });
  const [group] = await db
    .insert(standGroups)
    .values({
      festivalSectorId: sector!.id,
      type: "full_table",
      fullTablePrice: 640,
    })
    .returning({ id: standGroups.id });

  const base = {
    festivalId: festival!.id,
    festivalSectorId: sector!.id,
    standCategory: "illustration" as const,
    price: 350,
    individualPrice: 350,
    sharedPrice: 420,
    positionTop: 0,
  };
  const created = await db
    .insert(stands)
    .values([
      { ...base, standNumber: 1, positionLeft: 0, standGroupId: group!.id },
      { ...base, standNumber: 2, positionLeft: 10, standGroupId: group!.id },
      {
        ...base,
        standNumber: 3,
        positionLeft: 40,
        individualPrice: 300,
        price: 300,
        sharedPrice: null,
        participationType: "live_activity" as const,
      },
    ])
    .returning({ id: stands.id });

  const [subcategory] = await db
    .insert(subcategories)
    .values({ label: `Cómic ${tag}`, category: "illustration" })
    .returning({ id: subcategories.id });
  subcategoryIds.push(subcategory!.id);
  await db
    .insert(standSubcategories)
    .values({ standId: created[2]!.id, subcategoryId: subcategory!.id });

  return { festivalId: festival!.id, name: festival!.name };
}

async function snapshot(festivalId: number) {
  const db = integrationDb!;
  const [festival] = await db
    .select()
    .from(festivals)
    .where(eq(festivals.id, festivalId));
  const sectorRows = await db.query.festivalSectors.findMany({
    where: eq(festivalSectors.festivalId, festivalId),
    with: {
      stands: {
        with: {
          standGroup: true,
          standSubcategories: { with: { subcategory: true } },
        },
      },
    },
  });
  const features = await db
    .select()
    .from(festivalReservationFeatures)
    .where(eq(festivalReservationFeatures.festivalId, festivalId));
  const dates = await db
    .select()
    .from(festivalDates)
    .where(eq(festivalDates.festivalId, festivalId));

  const standRows = sectorRows
    .flatMap((sector) => sector.stands)
    .sort((a, b) => a.standNumber - b.standNumber);
  return {
    festival: festival!,
    dates: dates.map((d) => [
      d.startDate.toISOString(),
      d.endDate.toISOString(),
    ]),
    features: features
      .map((f) => ({
        type: f.type,
        category: f.category,
        enabled: f.enabled,
        creditPrice: f.creditPrice,
        deadlineOverrideAt: f.deadlineOverrideAt?.toISOString() ?? null,
      }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    stands: standRows.map((stand) => ({
      standNumber: stand.standNumber,
      individualPrice: stand.individualPrice,
      sharedPrice: stand.sharedPrice,
      participationType: stand.participationType,
      groupType: stand.standGroup?.type ?? null,
      fullTablePrice: stand.standGroup?.fullTablePrice ?? null,
      subcategories: stand.standSubcategories.map((s) => s.subcategory.label),
    })),
    groupIds: new Set(
      standRows.map((s) => s.standGroupId).filter((id) => id != null),
    ),
  };
}

describeDatabase("festival duplicate and export round trip", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({
      duplicateFestival,
      exportFestivalData,
      importFestivalData,
      createFestivalFromImport,
    } = await import("@/app/lib/festival_exports/actions"));

    const [admin] = await integrationDb!
      .insert(users)
      .values({
        clerkId: `clerk-dup-${randomUUID()}`,
        email: `dup-${randomUUID()}@example.test`,
        role: "admin",
        status: "verified",
      })
      .returning({ id: users.id });
    adminId = admin!.id;
    requireAdminOrFestivalAdmin.mockResolvedValue({
      id: adminId,
      role: "admin",
    });
  }, 60_000);

  afterAll(async () => {
    const db = integrationDb!;
    if (festivalIds.length > 0) {
      await db.delete(stands).where(inArray(stands.festivalId, festivalIds));
      await db
        .delete(festivalStatusEvents)
        .where(inArray(festivalStatusEvents.festivalId, festivalIds));
      await db.delete(festivals).where(inArray(festivals.id, festivalIds));
    }
    if (subcategoryIds.length > 0) {
      await db
        .delete(subcategories)
        .where(inArray(subcategories.id, subcategoryIds));
    }
    if (adminId) await db.delete(users).where(eq(users.id, adminId));
    await pool?.end();
  });

  it("duplicates prices, full tables, subcategories and reservation features", async () => {
    const source = await seedSource();
    const result = await duplicateFestival({
      festivalId: source.festivalId,
      name: `${source.name} (copia)`,
    });
    expect(result).toMatchObject({ success: true });
    festivalIds.push(result.festivalId!);

    const before = await snapshot(source.festivalId);
    const after = await snapshot(result.festivalId!);

    expect(after.festival).toMatchObject({
      name: `${source.name} (copia)`,
      status: "draft",
      reservationHoldMinutes: 12,
      publicRegistration: false,
    });
    expect(after.dates).toEqual(before.dates);
    expect(after.features).toEqual(before.features);
    expect(after.stands).toEqual(before.stands);
    expect(after.stands[0]).toMatchObject({
      groupType: "full_table",
      fullTablePrice: 640,
      sharedPrice: 420,
    });
    expect(after.stands[2]).toMatchObject({
      participationType: "live_activity",
      sharedPrice: null,
    });
    // A new table of its own, not the source's group re-parented.
    expect([...after.groupIds].some((id) => before.groupIds.has(id))).toBe(
      false,
    );
  });

  it("refuses a name another festival already has", async () => {
    const source = await seedSource();
    expect(
      await duplicateFestival({
        festivalId: source.festivalId,
        name: source.name,
      }),
    ).toMatchObject({ success: false });
  });

  it("round-trips the same data through an exported file", async () => {
    const source = await seedSource();
    const exported = await exportFestivalData(source.festivalId, {
      includeBasicInfo: true,
      includeSectors: true,
    });
    expect(exported.data?.version).toBe("2.1");

    // Through JSON, as a downloaded file would be.
    const file = JSON.parse(JSON.stringify(exported.data));
    const created = await createFestivalFromImport(
      file,
      `import-${randomUUID()}`,
    );
    expect(created).toMatchObject({ success: true });
    festivalIds.push(created.festivalId!);

    const before = await snapshot(source.festivalId);
    const after = await snapshot(created.festivalId!);
    expect(after.stands).toEqual(before.stands);
    expect(after.features).toEqual(before.features);
  });

  it("replaces an existing festival's tables on a replace import", async () => {
    const source = await seedSource();
    const target = await seedSource();
    const targetBefore = await snapshot(target.festivalId);

    const exported = await exportFestivalData(source.festivalId, {
      includeBasicInfo: false,
      includeSectors: true,
    });
    const result = await importFestivalData(target.festivalId, exported.data!, {
      importBasicInfo: false,
      importSectors: true,
      sectorImportMode: "replace",
    });
    expect(result).toMatchObject({ success: true });

    const after = await snapshot(target.festivalId);
    expect(after.stands).toEqual((await snapshot(source.festivalId)).stands);
    // The target's old table went with its stands instead of lingering empty.
    const [oldGroupId] = [...targetBefore.groupIds];
    expect(
      await integrationDb!
        .select({ id: standGroups.id })
        .from(standGroups)
        .where(eq(standGroups.id, oldGroupId!)),
    ).toEqual([]);
  });

  it("reads a 2.0 file with a single stand price as the individual price", async () => {
    const created = await createFestivalFromImport(
      {
        version: "2.0",
        metadata: { name: "legacy", createdAt: new Date().toISOString() },
        sectors: [
          {
            name: "S",
            description: null,
            orderInFestival: 1,
            mapBounds: {
              originX: null,
              originY: null,
              width: null,
              height: null,
            },
            stands: [
              {
                label: null,
                standNumber: 1,
                standCategory: "gastronomy",
                zone: "main",
                orientation: "landscape",
                width: null,
                height: null,
                positionLeft: 0,
                positionTop: 0,
                price: 275,
              },
            ],
          },
        ],
      },
      `legacy-${randomUUID()}`,
    );
    expect(created).toMatchObject({ success: true });
    festivalIds.push(created.festivalId!);

    const after = await snapshot(created.festivalId!);
    expect(after.stands).toEqual([
      expect.objectContaining({
        individualPrice: 275,
        sharedPrice: null,
        groupType: null,
      }),
    ]);
  });
});
