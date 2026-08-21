// @vitest-environment node

import { asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  orderAdjustmentItems,
  orderAdjustments,
  orderEvents,
  orderItems,
  orders,
  products,
  users,
} from "@/db/schema";

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: vi.fn().mockResolvedValue({ id: 1, role: "user" }),
  getCurrentBaseProfile: vi.fn().mockResolvedValue(null),
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

type CorrectionModule = typeof import("@/app/lib/orders/category-correction");
let correctHistoricalLineCategoriesWithDatabase: CorrectionModule["correctHistoricalLineCategoriesWithDatabase"];
let fetchHistoricalLineCategorySourcesWithDatabase: CorrectionModule["fetchHistoricalLineCategorySourcesWithDatabase"];
let correctHistoricalLineCategoriesAction: (typeof import("@/app/lib/orders/actions"))["correctHistoricalLineCategoriesAction"];

function correctionDatabase() {
  return integrationDb as Parameters<
    typeof correctHistoricalLineCategoriesWithDatabase
  >[0];
}

type Fixture = {
  actorId: number;
  orderId: number;
  baseItemId: number;
  productId: number;
  adjustmentId: number;
  addedItemIds: number[];
};

const fixtures: Fixture[] = [];

async function createFixture(): Promise<Fixture> {
  const db = integrationDb!;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [actor] = await db
    .insert(users)
    .values({
      clerkId: `integration-correction-${suffix}`,
      email: `integration-correction-${suffix}@example.test`,
      displayName: "Integration Admin",
      role: "admin",
    })
    .returning();
  const [product] = await db
    .insert(products)
    .values({
      name: `Supply ${suffix}`,
      slug: `integration-correction-${suffix}`,
      price: 20,
      unitCost: 7,
      stock: 10,
      isPurchasable: true,
      storeCategory: "supplies",
    })
    .returning();
  const [order] = await db
    .insert(orders)
    .values({
      userId: actor.id,
      status: "paid",
      totalAmount: 60,
      revision: 1,
    })
    .returning();
  const [baseItem] = await db
    .insert(orderItems)
    .values({
      orderId: order.id,
      productId: product.id,
      quantity: 2,
      priceAtPurchase: 20,
      unitCostAtPurchase: 7,
      productNameAtPurchase: product.name,
      transactionType: "purchase",
      storeCategoryAtPurchase: "merch",
    })
    .returning();
  const [adjustment] = await db
    .insert(orderAdjustments)
    .values({
      orderId: order.id,
      actorUserId: actor.id,
      actorRole: "admin",
      reason: "Fixture adjustment",
      previousTotal: 40,
      totalDelta: 20,
      newTotal: 60,
    })
    .returning();
  // One linked delta on the base line plus an added group with two rows.
  const addedRows = await db
    .insert(orderAdjustmentItems)
    .values([
      {
        adjustmentId: adjustment.id,
        baseOrderItemId: baseItem.id,
        productId: product.id,
        productVariantId: null,
        productNameSnapshot: product.name,
        variantLabelSnapshot: null,
        transactionType: "purchase",
        storeCategorySnapshot: "merch",
        quantityDelta: 1,
        unitPriceSnapshot: 20,
        unitCostSnapshot: 7,
      },
      {
        adjustmentId: adjustment.id,
        baseOrderItemId: null,
        productId: product.id,
        productVariantId: null,
        productNameSnapshot: `${product.name} extra`,
        variantLabelSnapshot: null,
        transactionType: "purchase",
        storeCategorySnapshot: "merch",
        quantityDelta: 3,
        unitPriceSnapshot: 15,
        unitCostSnapshot: 6,
      },
      {
        adjustmentId: adjustment.id,
        baseOrderItemId: null,
        productId: product.id,
        productVariantId: null,
        productNameSnapshot: `${product.name} extra`,
        variantLabelSnapshot: null,
        transactionType: "purchase",
        storeCategorySnapshot: "merch",
        quantityDelta: -3,
        unitPriceSnapshot: 15,
        unitCostSnapshot: 6,
      },
    ])
    .returning();

  const fixture: Fixture = {
    actorId: actor.id,
    orderId: order.id,
    baseItemId: baseItem.id,
    productId: product.id,
    adjustmentId: adjustment.id,
    addedItemIds: addedRows
      .filter((row) => row.baseOrderItemId == null)
      .map((row) => row.id),
  };
  fixtures.push(fixture);
  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  const db = integrationDb!;
  await db.delete(orderEvents).where(eq(orderEvents.orderId, fixture.orderId));
  await db
    .delete(orderAdjustmentItems)
    .where(eq(orderAdjustmentItems.adjustmentId, fixture.adjustmentId));
  await db
    .delete(orderAdjustments)
    .where(eq(orderAdjustments.id, fixture.adjustmentId));
  await db.delete(orderItems).where(eq(orderItems.orderId, fixture.orderId));
  await db.delete(orders).where(eq(orders.id, fixture.orderId));
  await db.delete(products).where(eq(products.id, fixture.productId));
  await db.delete(users).where(eq(users.id, fixture.actorId));
}

function baseSource(fixture: Fixture) {
  return {
    sourceKey: `base:${fixture.baseItemId}`,
    orderId: fixture.orderId,
    expectedOrderRevision: 1,
    expectedCategory: "merch" as const,
  };
}

describeDatabase("historical category correction", () => {
  beforeAll(async () => {
    // Load application modules only after a dedicated, safely named test DB is
    // present. These values satisfy unrelated app-env validation in isolation.
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({
      correctHistoricalLineCategoriesWithDatabase,
      fetchHistoricalLineCategorySourcesWithDatabase,
    } = await import("@/app/lib/orders/category-correction"));
    ({ correctHistoricalLineCategoriesAction } = await import(
      "@/app/lib/orders/actions"
    ));

    const result = await pool!.query<{ orders: string | null }>(
      "select to_regclass('public.orders')::text as orders",
    );
    if (!result.rows[0]?.orders) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  afterEach(async () => {
    while (fixtures.length > 0) await cleanupFixture(fixtures.pop()!);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("lists both base and added sources, including zeroed groups", async () => {
    const fixture = await createFixture();
    const sources = await fetchHistoricalLineCategorySourcesWithDatabase(
      correctionDatabase(),
      { orderId: fixture.orderId },
    );

    expect(
      sources.map(({ sourceKey, quantity, snapshotCategory }) => ({
        sourceKey,
        quantity,
        snapshotCategory,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          sourceKey: `base:${fixture.baseItemId}`,
          quantity: 3,
          snapshotCategory: "merch",
        },
        {
          sourceKey: `adjustment:${fixture.addedItemIds[0]}`,
          quantity: 0,
          snapshotCategory: "merch",
        },
      ]),
    );
    expect(sources).toHaveLength(2);
    expect(sources[0].currentProductCategory).toBe("supplies");
  });

  it("updates a base line together with its linked deltas", async () => {
    const fixture = await createFixture();
    const result = await correctHistoricalLineCategoriesWithDatabase(
      correctionDatabase(),
      {
        actorUserId: fixture.actorId,
        targetCategory: "supplies",
        reason: "Insumos vendidos antes del lanzamiento",
        sources: [baseSource(fixture)],
      },
    );

    const [line] = await integrationDb!
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, fixture.baseItemId));
    const linkedDeltas = await integrationDb!
      .select()
      .from(orderAdjustmentItems)
      .where(eq(orderAdjustmentItems.baseOrderItemId, fixture.baseItemId));
    const addedRows = await integrationDb!
      .select()
      .from(orderAdjustmentItems)
      .where(inArray(orderAdjustmentItems.id, fixture.addedItemIds));
    const [order] = await integrationDb!
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orderId));
    const events = await integrationDb!
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, fixture.orderId));

    expect(result).toMatchObject({
      changedSources: 1,
      unchangedSources: 0,
      changedOrders: 1,
    });
    expect(line.storeCategoryAtPurchase).toBe("supplies");
    expect(
      linkedDeltas.map((row) => row.storeCategorySnapshot),
    ).toEqual(["supplies"]);
    // Unrelated added lines keep their own snapshot.
    expect(
      addedRows.every((row) => row.storeCategorySnapshot === "merch"),
    ).toBe(true);
    expect(order.revision).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "category_corrected",
      revision: 2,
      actorId: fixture.actorId,
    });
    expect(events[0].payload).toMatchObject({
      targetCategory: "supplies",
      sourceKeys: [`base:${fixture.baseItemId}`],
      previousCategories: ["merch"],
      sourceCount: 1,
    });
  });

  it("updates every row of an added group, positive and negative", async () => {
    const fixture = await createFixture();
    await correctHistoricalLineCategoriesWithDatabase(correctionDatabase(), {
      actorUserId: fixture.actorId,
      targetCategory: "supplies",
      reason: "Grupo agregado mal clasificado",
      sources: [
        {
          sourceKey: `adjustment:${fixture.addedItemIds[0]}`,
          orderId: fixture.orderId,
          expectedOrderRevision: 1,
          expectedCategory: "merch",
        },
      ],
    });

    const addedRows = await integrationDb!
      .select()
      .from(orderAdjustmentItems)
      .where(inArray(orderAdjustmentItems.id, fixture.addedItemIds))
      .orderBy(asc(orderAdjustmentItems.id));
    const [baseLine] = await integrationDb!
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, fixture.baseItemId));

    expect(addedRows.map((row) => row.storeCategorySnapshot)).toEqual([
      "supplies",
      "supplies",
    ]);
    expect(baseLine.storeCategoryAtPurchase).toBe("merch");
  });

  it("rejects a stale order revision without writing", async () => {
    const fixture = await createFixture();
    await expect(
      correctHistoricalLineCategoriesWithDatabase(correctionDatabase(), {
        actorUserId: fixture.actorId,
        targetCategory: "supplies",
        reason: "Stale",
        sources: [{ ...baseSource(fixture), expectedOrderRevision: 9 }],
      }),
    ).rejects.toMatchObject({ cause: "conflict" });

    const [line] = await integrationDb!
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, fixture.baseItemId));
    const [order] = await integrationDb!
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orderId));
    const events = await integrationDb!
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, fixture.orderId));

    expect(line.storeCategoryAtPurchase).toBe("merch");
    expect(order.revision).toBe(1);
    expect(events).toHaveLength(0);
  });

  it("rejects a stale expected category without writing", async () => {
    const fixture = await createFixture();
    await expect(
      correctHistoricalLineCategoriesWithDatabase(correctionDatabase(), {
        actorUserId: fixture.actorId,
        targetCategory: "merch",
        reason: "Stale category",
        sources: [{ ...baseSource(fixture), expectedCategory: "supplies" }],
      }),
    ).rejects.toMatchObject({ cause: "conflict" });

    const [line] = await integrationDb!
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, fixture.baseItemId));
    expect(line.storeCategoryAtPurchase).toBe("merch");
  });

  it("rejects a source that belongs to another order", async () => {
    const fixture = await createFixture();
    const other = await createFixture();
    await expect(
      correctHistoricalLineCategoriesWithDatabase(correctionDatabase(), {
        actorUserId: fixture.actorId,
        targetCategory: "supplies",
        reason: "Wrong order",
        sources: [
          { ...baseSource(fixture), orderId: other.orderId },
        ],
      }),
    ).rejects.toMatchObject({ cause: "not_found" });
  });

  it("does not revise an order whose sources are already in the target", async () => {
    const fixture = await createFixture();
    const result = await correctHistoricalLineCategoriesWithDatabase(
      correctionDatabase(),
      {
        actorUserId: fixture.actorId,
        targetCategory: "merch",
        reason: "Already merchandise",
        sources: [baseSource(fixture)],
      },
    );

    const [order] = await integrationDb!
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orderId));
    const events = await integrationDb!
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, fixture.orderId));

    expect(result).toMatchObject({
      changedSources: 0,
      unchangedSources: 1,
      changedOrders: 0,
    });
    expect(order.revision).toBe(1);
    expect(events).toHaveLength(0);
  });

  it("rejects a non-admin caller at the action boundary", async () => {
    const fixture = await createFixture();
    const result = await correctHistoricalLineCategoriesAction({
      targetCategory: "supplies",
      reason: "Not allowed",
      sources: [baseSource(fixture)],
    });

    const [line] = await integrationDb!
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, fixture.baseItemId));

    expect(result).toMatchObject({
      success: false,
      message: "No tienes permisos para corregir categorías históricas.",
    });
    expect(line.storeCategoryAtPurchase).toBe("merch");
  });
});
