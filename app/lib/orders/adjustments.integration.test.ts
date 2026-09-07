// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
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
  orderAdjustmentItems,
  orderAdjustments,
  orderEvents,
  orderItems,
  orderReturnItems,
  orderReturns,
  orders,
  productOptions,
  productOptionValues,
  products,
  productVariantOptionValues,
  productVariants,
  users,
} from "@/db/schema";

vi.mock("server-only", () => ({}));

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

let applyOrderAdjustmentWithDatabase: (typeof import("@/app/lib/orders/adjustments"))["applyOrderAdjustmentWithDatabase"];
let consumeLineStockInTx: (typeof import("@/app/lib/rentals/order-stock"))["consumeLineStockInTx"];
let restoreLineStockInTx: (typeof import("@/app/lib/rentals/order-stock"))["restoreLineStockInTx"];

function adjustmentDatabase() {
  return integrationDb as Parameters<
    typeof applyOrderAdjustmentWithDatabase
  >[0];
}

type Fixture = {
  actorId: number;
  orderId: number;
  baseItemId: number;
  baseProductId: number;
  variantProductId: number;
  variantId: number;
  optionId: number;
  extraProductIds: number[];
};

const fixtures: Fixture[] = [];

async function createFixture(): Promise<Fixture> {
  const db = integrationDb!;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [actor] = await db
    .insert(users)
    .values({
      clerkId: `integration-order-${suffix}`,
      email: `integration-order-${suffix}@example.test`,
      displayName: "Integration Admin",
      role: "admin",
    })
    .returning();
  const [baseProduct] = await db
    .insert(products)
    .values({
      name: `Base ${suffix}`,
      slug: `integration-base-${suffix}`,
      price: 20,
      unitCost: 7,
      stock: 10,
      isPurchasable: true,
    })
    .returning();
  const [variantProduct] = await db
    .insert(products)
    .values({
      name: `Variant ${suffix}`,
      slug: `integration-variant-${suffix}`,
      price: 25,
      unitCost: 9,
      stock: 0,
      isPurchasable: true,
    })
    .returning();
  const [option] = await db
    .insert(productOptions)
    .values({ productId: variantProduct.id, name: "Color" })
    .returning();
  const [optionValue] = await db
    .insert(productOptionValues)
    .values({ optionId: option.id, value: "Rosa" })
    .returning();
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: variantProduct.id,
      price: 30,
      unitCost: 11,
      stock: 6,
      isVisible: true,
    })
    .returning();
  await db.insert(productVariantOptionValues).values({
    productId: variantProduct.id,
    variantId: variant.id,
    optionId: option.id,
    optionValueId: optionValue.id,
  });
  const [order] = await db
    .insert(orders)
    .values({
      userId: actor.id,
      status: "pending",
      totalAmount: 40,
      revision: 1,
    })
    .returning();
  const [baseItem] = await db
    .insert(orderItems)
    .values({
      orderId: order.id,
      productId: baseProduct.id,
      quantity: 2,
      priceAtPurchase: 20,
      unitCostAtPurchase: 7,
      productNameAtPurchase: baseProduct.name,
      transactionType: "purchase",
    })
    .returning();

  const fixture = {
    actorId: actor.id,
    orderId: order.id,
    baseItemId: baseItem.id,
    baseProductId: baseProduct.id,
    variantProductId: variantProduct.id,
    variantId: variant.id,
    optionId: option.id,
    extraProductIds: [],
  };
  fixtures.push(fixture);
  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  const db = integrationDb!;
  const adjustments = await db
    .select({ id: orderAdjustments.id })
    .from(orderAdjustments)
    .where(eq(orderAdjustments.orderId, fixture.orderId));
  await db
    .delete(orderReturns)
    .where(eq(orderReturns.orderId, fixture.orderId));
  await db.delete(orderEvents).where(eq(orderEvents.orderId, fixture.orderId));
  if (adjustments.length > 0) {
    const adjustmentIds = adjustments.map(({ id }) => id);
    await db
      .delete(orderAdjustmentItems)
      .where(inArray(orderAdjustmentItems.adjustmentId, adjustmentIds));
    await db
      .delete(orderAdjustments)
      .where(inArray(orderAdjustments.id, adjustmentIds));
  }
  await db.delete(orderItems).where(eq(orderItems.orderId, fixture.orderId));
  await db.delete(orders).where(eq(orders.id, fixture.orderId));
  await db
    .delete(productVariantOptionValues)
    .where(eq(productVariantOptionValues.productId, fixture.variantProductId));
  await db
    .delete(productOptionValues)
    .where(eq(productOptionValues.optionId, fixture.optionId));
  await db
    .delete(productVariants)
    .where(eq(productVariants.productId, fixture.variantProductId));
  await db
    .delete(productOptions)
    .where(eq(productOptions.id, fixture.optionId));
  await db
    .delete(products)
    .where(
      inArray(products.id, [
        fixture.baseProductId,
        fixture.variantProductId,
        ...fixture.extraProductIds,
      ]),
    );
  await db.delete(users).where(eq(users.id, fixture.actorId));
}

function baseAdjustment(fixture: Fixture, quantityDelta: number) {
  return {
    orderId: fixture.orderId,
    actorUserId: fixture.actorId,
    actorRole: "admin" as const,
    expectedRevision: 1,
    reason: "Integration adjustment",
    allowedStatuses: ["pending"] as const,
    items: [{ baseOrderItemId: fixture.baseItemId, quantityDelta }] as const,
  };
}

describeDatabase("applyOrderAdjustment database transaction", () => {
  beforeAll(async () => {
    // Load application modules only after a dedicated, safely named test DB is
    // present. These values satisfy unrelated app-env validation in isolation.
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ applyOrderAdjustmentWithDatabase } =
      await import("@/app/lib/orders/adjustments"));
    ({ consumeLineStockInTx, restoreLineStockInTx } =
      await import("@/app/lib/rentals/order-stock"));

    const result = await pool!.query<{ orders: string | null }>(
      "select to_regclass('public.orders')::text as orders",
    );
    if (!result.rows[0]?.orders) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  });

  afterEach(async () => {
    while (fixtures.length > 0) await cleanupFixture(fixtures.pop()!);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("commits stock, total, revision, immutable delta, and event atomically", async () => {
    const fixture = await createFixture();
    const result = await applyOrderAdjustmentWithDatabase(
      adjustmentDatabase(),
      baseAdjustment(fixture, 1),
    );

    expect(result).toMatchObject({
      revision: 2,
      previousTotal: 40,
      totalDelta: 20,
      newTotal: 60,
    });
    const [order] = await integrationDb!
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orderId));
    const [sourceLine] = await integrationDb!
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, fixture.baseItemId));
    const [product] = await integrationDb!
      .select()
      .from(products)
      .where(eq(products.id, fixture.baseProductId));
    const [delta] = await integrationDb!
      .select()
      .from(orderAdjustmentItems)
      .where(eq(orderAdjustmentItems.adjustmentId, result.adjustmentId));
    const events = await integrationDb!
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, fixture.orderId));

    expect(order).toMatchObject({ totalAmount: 60, revision: 2 });
    expect(sourceLine.quantity).toBe(2);
    expect(product.stock).toBe(9);
    expect(delta).toMatchObject({
      baseOrderItemId: fixture.baseItemId,
      quantityDelta: 1,
      unitPriceSnapshot: 20,
      unitCostSnapshot: 7,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "adjusted",
      revision: 2,
      adjustmentId: result.adjustmentId,
    });
  });

  it("restores stock for a negative delta without changing the source line", async () => {
    const fixture = await createFixture();
    await applyOrderAdjustmentWithDatabase(
      adjustmentDatabase(),
      baseAdjustment(fixture, -1),
    );

    const [product] = await integrationDb!
      .select()
      .from(products)
      .where(eq(products.id, fixture.baseProductId));
    const [sourceLine] = await integrationDb!
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, fixture.baseItemId));
    expect(product.stock).toBe(11);
    expect(sourceLine.quantity).toBe(2);
  });

  it("commits the return header and items with the adjustment", async () => {
    const fixture = await createFixture();
    const result = await applyOrderAdjustmentWithDatabase(
      adjustmentDatabase(),
      {
        ...baseAdjustment(fixture, -1),
        orderReturn: {
          status: "received",
          reason: "Customer return",
          items: [
            {
              orderItemId: fixture.baseItemId,
              productId: fixture.baseProductId,
              productVariantId: null,
              productNameSnapshot: "Returned product snapshot",
              variantLabelSnapshot: null,
              quantity: 1,
              unitPriceSnapshot: 20,
              unitCostSnapshot: 7,
            },
          ],
        },
      },
    );

    const [returnRecord] = await integrationDb!
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.adjustmentId, result.adjustmentId));
    const [returnItem] = await integrationDb!
      .select()
      .from(orderReturnItems)
      .where(eq(orderReturnItems.returnId, returnRecord.id));

    expect(returnRecord).toMatchObject({
      orderId: fixture.orderId,
      adjustmentId: result.adjustmentId,
      actorUserId: fixture.actorId,
      status: "received",
      reason: "Customer return",
      refundAmount: 20,
    });
    expect(returnItem).toMatchObject({
      orderItemId: fixture.baseItemId,
      productId: fixture.baseProductId,
      productVariantId: null,
      productNameSnapshot: "Returned product snapshot",
      variantLabelSnapshot: null,
      quantity: 1,
      unitPriceSnapshot: 20,
      unitCostSnapshot: 7,
    });
  });

  it("rolls back the adjustment when a return item insert fails", async () => {
    const fixture = await createFixture();
    await expect(
      applyOrderAdjustmentWithDatabase(adjustmentDatabase(), {
        ...baseAdjustment(fixture, -1),
        orderReturn: {
          status: "received",
          reason: "Invalid return",
          items: [
            {
              orderItemId: fixture.baseItemId,
              productId: fixture.baseProductId,
              productVariantId: null,
              productNameSnapshot: "Returned product snapshot",
              variantLabelSnapshot: null,
              quantity: 0,
              unitPriceSnapshot: 20,
              unitCostSnapshot: 7,
            },
          ],
        },
      }),
    ).rejects.toThrow();

    const [order] = await integrationDb!
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orderId));
    const [product] = await integrationDb!
      .select()
      .from(products)
      .where(eq(products.id, fixture.baseProductId));
    const adjustments = await integrationDb!
      .select()
      .from(orderAdjustments)
      .where(eq(orderAdjustments.orderId, fixture.orderId));
    const returns = await integrationDb!
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.orderId, fixture.orderId));

    expect(order).toMatchObject({ totalAmount: 40, revision: 1 });
    expect(product.stock).toBe(10);
    expect(adjustments).toHaveLength(0);
    expect(returns).toHaveLength(0);
  });

  it("rolls back every write when stock is insufficient", async () => {
    const fixture = await createFixture();
    await integrationDb!
      .update(products)
      .set({ stock: 0 })
      .where(eq(products.id, fixture.baseProductId));

    await expect(
      applyOrderAdjustmentWithDatabase(
        adjustmentDatabase(),
        baseAdjustment(fixture, 1),
      ),
    ).rejects.toMatchObject({ cause: "stock_insufficient" });

    const [order] = await integrationDb!
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orderId));
    const adjustments = await integrationDb!
      .select()
      .from(orderAdjustments)
      .where(eq(orderAdjustments.orderId, fixture.orderId));
    const events = await integrationDb!
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, fixture.orderId));
    expect(order).toMatchObject({ totalAmount: 40, revision: 1 });
    expect(adjustments).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("rejects a stale revision before writing adjustment data", async () => {
    const fixture = await createFixture();
    await expect(
      applyOrderAdjustmentWithDatabase(adjustmentDatabase(), {
        ...baseAdjustment(fixture, 1),
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ cause: "conflict" });
    const adjustments = await integrationDb!
      .select()
      .from(orderAdjustments)
      .where(eq(orderAdjustments.orderId, fixture.orderId));
    expect(adjustments).toHaveLength(0);
  });

  it("rejects a delta that would make the effective quantity negative", async () => {
    const fixture = await createFixture();
    await expect(
      applyOrderAdjustmentWithDatabase(
        adjustmentDatabase(),
        baseAdjustment(fixture, -3),
      ),
    ).rejects.toMatchObject({ cause: "invalid_quantity" });

    const [order] = await integrationDb!
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orderId));
    const adjustments = await integrationDb!
      .select()
      .from(orderAdjustments)
      .where(eq(orderAdjustments.orderId, fixture.orderId));
    expect(order).toMatchObject({ totalAmount: 40, revision: 1 });
    expect(adjustments).toHaveLength(0);
  });

  it("snapshots explicit variant price, cost, name, and label", async () => {
    const fixture = await createFixture();
    const result = await applyOrderAdjustmentWithDatabase(
      adjustmentDatabase(),
      {
        orderId: fixture.orderId,
        actorUserId: fixture.actorId,
        actorRole: "admin",
        expectedRevision: 1,
        reason: "Add variant",
        customerNote: "Preparar en rosa",
        allowedStatuses: ["pending"],
        items: [],
        additions: [
          {
            productId: fixture.variantProductId,
            productVariantId: fixture.variantId,
            quantity: 2,
          },
        ],
      },
    );
    const [line] = await integrationDb!
      .select()
      .from(orderAdjustmentItems)
      .where(eq(orderAdjustmentItems.adjustmentId, result.adjustmentId));
    const events = await integrationDb!
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, fixture.orderId));
    const [variant] = await integrationDb!
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, fixture.variantId));

    expect(line).toMatchObject({
      baseOrderItemId: null,
      productId: fixture.variantProductId,
      productVariantId: fixture.variantId,
      variantLabelSnapshot: "Color: Rosa",
      quantityDelta: 2,
      unitPriceSnapshot: 30,
      unitCostSnapshot: 11,
    });
    expect(line.productNameSnapshot).toMatch(/^Variant /);
    expect(variant.stock).toBe(4);
    expect(events.map(({ type }) => type).sort()).toEqual([
      "adjusted",
      "note_added",
    ]);
    expect(
      events.find((event) => event.type === "note_added")?.payload,
    ).toEqual({
      note: "Preparar en rosa",
      customerVisible: true,
    });
  });

  it("uses the rental stock pool captured by the original line", async () => {
    const fixture = await createFixture();
    const [rentalProduct] = await integrationDb!
      .insert(products)
      .values({
        name: `Rental ${Date.now()}`,
        slug: `integration-rental-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        price: 20,
        stock: 10,
        isPurchasable: false,
        isRentable: true,
        rentalPrice: 5,
        rentalStockMode: "separate",
        rentalStock: 4,
      })
      .returning();
    fixture.extraProductIds.push(rentalProduct.id);

    await integrationDb!.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(products)
        .where(eq(products.id, rentalProduct.id))
        .for("update");
      await consumeLineStockInTx(tx, locked, null, 2, "rental", "separate");
    });
    let [product] = await integrationDb!
      .select()
      .from(products)
      .where(eq(products.id, rentalProduct.id));
    expect(product).toMatchObject({ stock: 10, rentalStock: 2 });

    await integrationDb!.transaction(async (tx) => {
      await restoreLineStockInTx(tx, {
        productId: rentalProduct.id,
        productVariantId: null,
        quantity: 2,
        transactionType: "rental",
        rentalStockModeSnapshot: "separate",
        rentalReturnedQuantity: 0,
      });
    });
    [product] = await integrationDb!
      .select()
      .from(products)
      .where(eq(products.id, rentalProduct.id));
    expect(product).toMatchObject({ stock: 10, rentalStock: 4 });
  });

  it("snapshots the added product's current category", async () => {
    const fixture = await createFixture();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [supplyProduct] = await integrationDb!
      .insert(products)
      .values({
        name: `Supply ${suffix}`,
        slug: `integration-supply-${suffix}`,
        price: 15,
        unitCost: 6,
        stock: 8,
        isPurchasable: true,
        storeCategory: "supplies",
      })
      .returning();
    fixture.extraProductIds.push(supplyProduct.id);

    const result = await applyOrderAdjustmentWithDatabase(
      adjustmentDatabase(),
      {
        orderId: fixture.orderId,
        actorUserId: fixture.actorId,
        actorRole: "admin",
        expectedRevision: 1,
        reason: "Add supply",
        allowedStatuses: ["pending"],
        items: [],
        additions: [
          {
            productId: supplyProduct.id,
            productVariantId: null,
            quantity: 2,
          },
        ],
      },
    );
    const [line] = await integrationDb!
      .select()
      .from(orderAdjustmentItems)
      .where(eq(orderAdjustmentItems.adjustmentId, result.adjustmentId));

    expect(line).toMatchObject({
      productId: supplyProduct.id,
      quantityDelta: 2,
      storeCategorySnapshot: "supplies",
    });
  });

  it("copies the base line's category into linked deltas", async () => {
    const fixture = await createFixture();
    await integrationDb!
      .update(orderItems)
      .set({ storeCategoryAtPurchase: "supplies" })
      .where(eq(orderItems.id, fixture.baseItemId));

    const result = await applyOrderAdjustmentWithDatabase(
      adjustmentDatabase(),
      baseAdjustment(fixture, 1),
    );
    const [delta] = await integrationDb!
      .select()
      .from(orderAdjustmentItems)
      .where(eq(orderAdjustmentItems.adjustmentId, result.adjustmentId));

    expect(delta).toMatchObject({
      baseOrderItemId: fixture.baseItemId,
      storeCategorySnapshot: "supplies",
    });
  });

  it("keeps an added line's category when it is later edited or returned", async () => {
    const fixture = await createFixture();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [supplyProduct] = await integrationDb!
      .insert(products)
      .values({
        name: `Supply ${suffix}`,
        slug: `integration-supply-edit-${suffix}`,
        price: 15,
        unitCost: 6,
        stock: 8,
        isPurchasable: true,
        storeCategory: "supplies",
      })
      .returning();
    fixture.extraProductIds.push(supplyProduct.id);

    const added = await applyOrderAdjustmentWithDatabase(adjustmentDatabase(), {
      orderId: fixture.orderId,
      actorUserId: fixture.actorId,
      actorRole: "admin",
      expectedRevision: 1,
      reason: "Add supply",
      allowedStatuses: ["pending"],
      items: [],
      additions: [
        { productId: supplyProduct.id, productVariantId: null, quantity: 3 },
      ],
    });
    const [addedLine] = await integrationDb!
      .select()
      .from(orderAdjustmentItems)
      .where(eq(orderAdjustmentItems.adjustmentId, added.adjustmentId));

    // Reclassifying the product must not move the already-written snapshot.
    await integrationDb!
      .update(products)
      .set({ storeCategory: "merch" })
      .where(eq(products.id, supplyProduct.id));

    const edited = await applyOrderAdjustmentWithDatabase(
      adjustmentDatabase(),
      {
        orderId: fixture.orderId,
        actorUserId: fixture.actorId,
        actorRole: "admin",
        expectedRevision: 2,
        reason: "Return one supply",
        allowedStatuses: ["pending"],
        items: [],
        addedItems: [
          { adjustmentItemId: addedLine.id, quantityDelta: -1 },
        ],
      },
    );
    const [editDelta] = await integrationDb!
      .select()
      .from(orderAdjustmentItems)
      .where(eq(orderAdjustmentItems.adjustmentId, edited.adjustmentId));
    const [storedAddedLine] = await integrationDb!
      .select()
      .from(orderAdjustmentItems)
      .where(eq(orderAdjustmentItems.id, addedLine.id));

    expect(storedAddedLine.storeCategorySnapshot).toBe("supplies");
    expect(editDelta).toMatchObject({
      quantityDelta: -1,
      storeCategorySnapshot: "supplies",
    });
  });
});
