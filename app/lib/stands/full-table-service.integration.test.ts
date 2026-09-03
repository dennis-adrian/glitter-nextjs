// @vitest-environment node

import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
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
import { standsHaveReservations } from "@/app/lib/reservations/members";
import {
  festivalSectors,
  festivals,
  standGroups,
  standReservationStands,
  standReservations,
  stands,
} from "@/db/schema";

vi.mock("server-only", () => ({}));

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

let setStandGroupFullTable: (typeof import("@/app/lib/stands/full-table-service"))["setStandGroupFullTable"];
let findMalformedFullTableGroups: (typeof import("@/app/lib/stands/full-table-health"))["findMalformedFullTableGroups"];
let updateStandPrices: (typeof import("@/app/lib/stands/pricing-service"))["updateStandPrices"];
let guardLegacySinglePriceEdit: (typeof import("@/app/lib/stands/pricing-service"))["guardLegacySinglePriceEdit"];

const createdFestivalIds: number[] = [];
const createdGroupIds: number[] = [];
const createdReservationIds: number[] = [];

type StandOverrides = Partial<typeof stands.$inferInsert>;

async function createPair(
  left: StandOverrides = {},
  right: StandOverrides = {},
) {
  const db = integrationDb!;
  const [festival] = await db
    .insert(festivals)
    .values({ name: `full-table-${randomUUID()}` })
    .returning({ id: festivals.id });
  createdFestivalIds.push(festival!.id);
  const [sector] = await db
    .insert(festivalSectors)
    .values({ festivalId: festival!.id, name: "pairs" })
    .returning({ id: festivalSectors.id });
  const [group] = await db
    .insert(standGroups)
    .values({ festivalSectorId: sector!.id })
    .returning({ id: standGroups.id });
  createdGroupIds.push(group!.id);

  const base: typeof stands.$inferInsert = {
    standNumber: 1,
    festivalSectorId: sector!.id,
    standGroupId: group!.id,
    standCategory: "illustration",
    individualPrice: 200,
    sharedPrice: 300,
    positionLeft: 10,
    positionTop: 10,
  };
  const inserted = await db
    .insert(stands)
    .values([
      { ...base, standNumber: 1, label: "A1", ...left },
      { ...base, standNumber: 2, label: "A2", ...right },
    ])
    .returning({ id: stands.id });

  return { groupId: group!.id, standIds: inserted.map((row) => row.id) };
}

describeDatabase("setStandGroupFullTable", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    ({ setStandGroupFullTable } =
      await import("@/app/lib/stands/full-table-service"));
    ({ findMalformedFullTableGroups } =
      await import("@/app/lib/stands/full-table-health"));
    ({ updateStandPrices, guardLegacySinglePriceEdit } =
      await import("@/app/lib/stands/pricing-service"));

    try {
      await integrationDb!
        .select({ id: standGroups.type })
        .from(standGroups)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  afterEach(async () => {
    const db = integrationDb!;
    if (createdReservationIds.length > 0) {
      await db
        .delete(standReservations)
        .where(inArray(standReservations.id, createdReservationIds));
      createdReservationIds.length = 0;
    }
    if (createdGroupIds.length > 0) {
      await db
        .delete(stands)
        .where(inArray(stands.standGroupId, createdGroupIds));
      await db
        .delete(standGroups)
        .where(inArray(standGroups.id, createdGroupIds));
      createdGroupIds.length = 0;
    }
    if (createdFestivalIds.length > 0) {
      await db
        .delete(festivals)
        .where(inArray(festivals.id, createdFestivalIds));
      createdFestivalIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function groupType(groupId: number) {
    const [row] = await integrationDb!
      .select({ type: standGroups.type })
      .from(standGroups)
      .where(eq(standGroups.id, groupId));
    return row?.type;
  }

  it("declares a matching illustration pair a full table", async () => {
    const { groupId } = await createPair();

    const result = await setStandGroupFullTable({ groupId, enabled: true });

    expect(result).toMatchObject({ ok: true, type: "full_table" });
    expect(await groupType(groupId)).toBe("full_table");
  });

  it("refuses a mismatched pair and leaves the type untouched", async () => {
    const { groupId } = await createPair({}, { sharedPrice: 350 });

    const result = await setStandGroupFullTable({ groupId, enabled: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_PAIR");
    expect(result.problems!.map((problem) => problem.code)).toContain(
      "SHARED_PRICE_MISMATCH",
    );
    // The group must not have been half-updated.
    expect(await groupType(groupId)).toBe("visual_group");
  });

  it("refuses a group that is not exactly two stands", async () => {
    const { groupId } = await createPair();
    const [extra] = await integrationDb!
      .select({ id: stands.id })
      .from(stands)
      .where(eq(stands.standGroupId, groupId))
      .limit(1);
    await integrationDb!.insert(stands).values({
      standNumber: 3,
      label: "A3",
      standGroupId: groupId,
      festivalSectorId: (
        await integrationDb!
          .select({ id: stands.festivalSectorId })
          .from(stands)
          .where(eq(stands.id, extra!.id))
      )[0]!.id,
      standCategory: "illustration",
      individualPrice: 200,
      sharedPrice: 300,
      positionLeft: 10,
      positionTop: 10,
    });

    const result = await setStandGroupFullTable({ groupId, enabled: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems!.map((problem) => problem.code)).toEqual([
      "MEMBER_COUNT",
    ]);
  });

  it("refuses to reconfigure a pair with a live reservation", async () => {
    const { groupId, standIds } = await createPair();
    const [festivalId] = createdFestivalIds.slice(-1);
    const [reservation] = await integrationDb!
      .insert(standReservations)
      .values({ standId: standIds[0], festivalId, status: "accepted" })
      .returning({ id: standReservations.id });
    createdReservationIds.push(reservation!.id);
    // Occupancy is resolved through membership, so the fixture has to create
    // the member row the real writers create.
    await integrationDb!
      .insert(standReservationStands)
      .values({ reservationId: reservation!.id, standId: standIds[0] });

    const result = await setStandGroupFullTable({ groupId, enabled: true });

    expect(result).toMatchObject({ ok: false, code: "OCCUPIED" });
    expect(await groupType(groupId)).toBe("visual_group");
  });

  it("reports a pair that became malformed after it was declared", async () => {
    const { groupId, standIds } = await createPair();
    await setStandGroupFullTable({ groupId, enabled: true });
    // Scoped to this group: the report is global, so asserting it is empty
    // would make this test fail on unrelated data elsewhere in the database.
    expect(
      (await findMalformedFullTableGroups()).map((group) => group.groupId),
    ).not.toContain(groupId);

    // A later price edit invalidates a pair that is already reservable.
    await integrationDb!
      .update(stands)
      .set({ sharedPrice: 999 })
      .where(eq(stands.id, standIds[1]));

    const malformed = await findMalformedFullTableGroups();
    expect(malformed.map((group) => group.groupId)).toContain(groupId);
    expect(
      malformed
        .find((group) => group.groupId === groupId)!
        .problems.map((problem) => problem.code),
    ).toContain("SHARED_PRICE_MISMATCH");
  });

  it("returns a group to a visual group without revalidating the pair", async () => {
    const { groupId, standIds } = await createPair();
    await setStandGroupFullTable({ groupId, enabled: true });
    await integrationDb!
      .update(stands)
      .set({ sharedPrice: 999 })
      .where(eq(stands.id, standIds[1]));

    // Undoing a bad pair must always be possible, even while invalid.
    const result = await setStandGroupFullTable({ groupId, enabled: false });

    expect(result).toMatchObject({ ok: true, type: "visual_group" });
    expect(await groupType(groupId)).toBe("visual_group");
  });

  it("reports a missing group", async () => {
    expect(
      await setStandGroupFullTable({ groupId: 2_000_000_000, enabled: true }),
    ).toMatchObject({ ok: false, code: "GROUP_NOT_FOUND" });
  });

  describe("updateStandPrices", () => {
    async function priceOf(standId: number) {
      const [row] = await integrationDb!
        .select({
          individualPrice: stands.individualPrice,
          sharedPrice: stands.sharedPrice,
        })
        .from(stands)
        .where(eq(stands.id, standId));
      return {
        individualPrice: Number(row!.individualPrice),
        sharedPrice: row!.sharedPrice == null ? null : Number(row!.sharedPrice),
      };
    }

    it("updates an unpaired stand", async () => {
      const { standIds } = await createPair();

      const result = await updateStandPrices([
        { standId: standIds[0], individualPrice: 275, sharedPrice: 400 },
      ]);

      expect(result).toMatchObject({ ok: true, updated: 1 });
      expect(await priceOf(standIds[0])).toEqual({
        individualPrice: 275,
        sharedPrice: 400,
      });
    });

    it("refuses a shared price below the individual price", async () => {
      const { standIds } = await createPair();

      const result = await updateStandPrices([
        { standId: standIds[0], individualPrice: 300, sharedPrice: 200 },
      ]);

      expect(result).toMatchObject({ ok: false, code: "INVALID_PRICES" });
      // Nothing was written.
      expect(await priceOf(standIds[0])).toEqual({
        individualPrice: 200,
        sharedPrice: 300,
      });
    });

    it("refuses an individual price above the stored shared price", async () => {
      const { standIds } = await createPair();

      // No `sharedPrice` key at all: the stored 300 stays, and 350 overtakes it.
      const result = await updateStandPrices([
        { standId: standIds[0], individualPrice: 350 },
      ]);

      expect(result).toMatchObject({ ok: false, code: "INVALID_PRICES" });
      if (result.ok) return;
      expect(result.problems[0].message).toContain("compartido guardado");
      expect(await priceOf(standIds[0])).toEqual({
        individualPrice: 200,
        sharedPrice: 300,
      });
    });

    it("refuses more than two decimals", async () => {
      const { standIds } = await createPair();
      const result = await updateStandPrices([
        { standId: standIds[0], individualPrice: 10.005 },
      ]);
      expect(result).toMatchObject({ ok: false, code: "INVALID_PRICES" });
    });

    it("refuses a shared price on a non-illustration stand", async () => {
      const { standIds } = await createPair(
        { standCategory: "entrepreneurship", sharedPrice: null },
        { standCategory: "entrepreneurship", sharedPrice: null },
      );

      const result = await updateStandPrices([
        { standId: standIds[0], individualPrice: 100, sharedPrice: 150 },
      ]);

      expect(result).toMatchObject({ ok: false, code: "INVALID_PRICES" });
      if (result.ok) return;
      expect(result.problems[0].message).toContain("ilustración");
    });

    it("refuses repricing one half of a declared full table", async () => {
      const { groupId, standIds } = await createPair();
      await setStandGroupFullTable({ groupId, enabled: true });

      const result = await updateStandPrices([
        { standId: standIds[0], individualPrice: 250, sharedPrice: 400 },
      ]);

      expect(result).toMatchObject({ ok: false, code: "BREAKS_PAIR" });
      // Refused before writing, so the half keeps its original price.
      expect(await priceOf(standIds[0])).toEqual({
        individualPrice: 200,
        sharedPrice: 300,
      });
    });

    it("accepts repricing both halves together", async () => {
      const { groupId, standIds } = await createPair();
      await setStandGroupFullTable({ groupId, enabled: true });

      const result = await updateStandPrices([
        { standId: standIds[0], individualPrice: 250, sharedPrice: 400 },
        { standId: standIds[1], individualPrice: 250, sharedPrice: 400 },
      ]);

      expect(result).toMatchObject({ ok: true, updated: 2 });
      expect(await priceOf(standIds[0])).toEqual({
        individualPrice: 250,
        sharedPrice: 400,
      });
      expect(await findMalformedFullTableGroups()).not.toContainEqual(
        expect.objectContaining({ groupId }),
      );
    });

    it("allows repricing one half once the full table is turned off", async () => {
      const { groupId, standIds } = await createPair();
      await setStandGroupFullTable({ groupId, enabled: true });
      await setStandGroupFullTable({ groupId, enabled: false });

      const result = await updateStandPrices([
        { standId: standIds[0], individualPrice: 250, sharedPrice: 400 },
      ]);

      expect(result).toMatchObject({ ok: true, updated: 1 });
    });

    it("reports missing stands without writing the rest", async () => {
      const { standIds } = await createPair();

      const result = await updateStandPrices([
        { standId: standIds[0], individualPrice: 275 },
        { standId: 2_000_000_000, individualPrice: 275 },
      ]);

      expect(result).toMatchObject({ ok: false, code: "STANDS_NOT_FOUND" });
      expect((await priceOf(standIds[0])).individualPrice).toBe(200);
    });
  });

  /**
   * The legacy admin editors send a single amount and skip the pair rules, so
   * the guard has to catch the two edits that could break an invariant before
   * they reach the row.
   */
  describe("standsHaveReservations", () => {
    it("sees a companion reachable only through membership", async () => {
      const { standIds } = await createPair();
      const [festivalId] = createdFestivalIds.slice(-1);
      const [reservation] = await integrationDb!
        .insert(standReservations)
        .values({ standId: standIds[0], festivalId, status: "accepted" })
        .returning({ id: standReservations.id });
      createdReservationIds.push(reservation!.id);
      await integrationDb!.insert(standReservationStands).values([
        { reservationId: reservation!.id, standId: standIds[0], position: 0 },
        { reservationId: reservation!.id, standId: standIds[1], position: 1 },
      ]);

      // The companion has no stand_reservations row of its own; checking the
      // parent column alone would report it deletable and the foreign key
      // would then reject the delete with an opaque error.
      await expect(
        integrationDb!.transaction((tx) =>
          standsHaveReservations(tx, [standIds[1]]),
        ),
      ).resolves.toBe(true);
    });

    it("still sees a half retired by a downgrade", async () => {
      const { standIds } = await createPair();
      const [festivalId] = createdFestivalIds.slice(-1);
      const [reservation] = await integrationDb!
        .insert(standReservations)
        .values({ standId: standIds[0], festivalId, status: "accepted" })
        .returning({ id: standReservations.id });
      createdReservationIds.push(reservation!.id);
      await integrationDb!.insert(standReservationStands).values({
        reservationId: reservation!.id,
        standId: standIds[1],
        position: 1,
        releasedAt: new Date(),
      });

      // Membership rows are history and are never deleted, so the released
      // half still pins its stand.
      await expect(
        integrationDb!.transaction((tx) =>
          standsHaveReservations(tx, [standIds[1]]),
        ),
      ).resolves.toBe(true);
    });

    it("reports an untouched stand as deletable", async () => {
      const { standIds } = await createPair();
      await expect(
        integrationDb!.transaction((tx) =>
          standsHaveReservations(tx, [standIds[1]]),
        ),
      ).resolves.toBe(false);
    });
  });

  describe("guardLegacySinglePriceEdit", () => {
    it("blocks a half of a declared full table", async () => {
      const { groupId, standIds } = await createPair();
      await setStandGroupFullTable({ groupId, enabled: true });

      const result = await integrationDb!.transaction((tx) =>
        guardLegacySinglePriceEdit(tx, [standIds[0]], 250),
      );

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toMatch(/mesa completa/i);
    });

    it("blocks an amount that would overtake the stored shared price", async () => {
      const { standIds } = await createPair();

      const result = await integrationDb!.transaction((tx) =>
        guardLegacySinglePriceEdit(tx, [standIds[0]], 500),
      );

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toMatch(/compartido/i);
    });

    it("allows an ordinary unpaired edit", async () => {
      const { standIds } = await createPair();

      const result = await integrationDb!.transaction((tx) =>
        guardLegacySinglePriceEdit(tx, [standIds[0]], 250),
      );

      expect(result).toEqual({ ok: true });
    });
  });
});
