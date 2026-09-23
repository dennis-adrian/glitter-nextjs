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
  merchBundleComponents,
  merchBundleComponentVariants,
  merchBundles,
  orderAdjustments,
  orderBundleItems,
  orderBundles,
  orderEvents,
  orderItems,
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 6 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/orders/actions");
let createOrderInTx: Actions["createOrderInTx"];
let createGuestOrderInTx: Actions["createGuestOrderInTx"];
let applyOrderAdjustmentWithDatabase: (typeof import("@/app/lib/orders/adjustments"))["applyOrderAdjustmentWithDatabase"];
let restoreEffectiveOrderStockInTx: (typeof import("@/app/lib/orders/cancellation"))["restoreEffectiveOrderStockInTx"];

type Fixture = {
  userId: number;
  shirtId: number;
  shirtSmallId: number;
  shirtMediumId: number;
  toteId: number;
  stickersId: number;
  bundleId: number;
  shirtComponentId: number;
  orderIds: number[];
};

const fixtures: Fixture[] = [];

function db() {
  return integrationDb!;
}

/**
 * Shirt (S/M, Bs100) + tote (Bs60) + 2 × stickers (Bs10) = Bs180 separately,
 * sold as a Bs150 bundle where the customer picks the shirt size.
 */
async function createFixture(
  stock: { small?: number; medium?: number; tote?: number; stickers?: number } = {},
): Promise<Fixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await db()
    .insert(users)
    .values({
      clerkId: `bundle-checkout-${suffix}`,
      email: `bundle-checkout-${suffix}@example.test`,
      displayName: "Bundle Buyer",
      status: "verified",
    })
    .returning();
  const [shirt, tote, stickers] = await db()
    .insert(products)
    .values([
      {
        name: `Polera ${suffix}`,
        slug: `bundle-polera-${suffix}`,
        price: 100,
        unitCost: 40,
        stock: 0,
        storeCategory: "merch",
      },
      {
        name: `Tote ${suffix}`,
        slug: `bundle-tote-${suffix}`,
        price: 60,
        unitCost: 20,
        stock: stock.tote ?? 5,
        storeCategory: "merch",
      },
      {
        name: `Stickers ${suffix}`,
        slug: `bundle-stickers-${suffix}`,
        price: 10,
        unitCost: 2,
        stock: stock.stickers ?? 10,
        storeCategory: "merch",
      },
    ])
    .returning();
  const [option] = await db()
    .insert(productOptions)
    .values({ productId: shirt.id, name: "Talla" })
    .returning();
  const [small, medium] = await db()
    .insert(productOptionValues)
    .values([
      { optionId: option.id, value: "S", sortOrder: 0 },
      { optionId: option.id, value: "M", sortOrder: 1 },
    ])
    .returning();
  const [smallVariant, mediumVariant] = await db()
    .insert(productVariants)
    .values([
      { productId: shirt.id, stock: stock.small ?? 5, sortOrder: 0 },
      { productId: shirt.id, stock: stock.medium ?? 5, sortOrder: 1 },
    ])
    .returning();
  await db()
    .insert(productVariantOptionValues)
    .values([
      {
        productId: shirt.id,
        variantId: smallVariant.id,
        optionId: option.id,
        optionValueId: small.id,
      },
      {
        productId: shirt.id,
        variantId: mediumVariant.id,
        optionId: option.id,
        optionValueId: medium.id,
      },
    ]);
  const [bundle] = await db()
    .insert(merchBundles)
    .values({
      name: `Kit ${suffix}`,
      slug: `kit-${suffix}`,
      price: 150,
      isVisible: true,
    })
    .returning();
  const [shirtComponent] = await db()
    .insert(merchBundleComponents)
    .values([
      { bundleId: bundle.id, productId: shirt.id, quantity: 1, sortOrder: 0 },
      { bundleId: bundle.id, productId: tote.id, quantity: 1, sortOrder: 1 },
      { bundleId: bundle.id, productId: stickers.id, quantity: 2, sortOrder: 2 },
    ])
    .returning();
  await db()
    .insert(merchBundleComponentVariants)
    .values([
      {
        componentId: shirtComponent.id,
        productId: shirt.id,
        variantId: smallVariant.id,
      },
      {
        componentId: shirtComponent.id,
        productId: shirt.id,
        variantId: mediumVariant.id,
      },
    ]);
  const fixture: Fixture = {
    userId: user.id,
    shirtId: shirt.id,
    shirtSmallId: smallVariant.id,
    shirtMediumId: mediumVariant.id,
    toteId: tote.id,
    stickersId: stickers.id,
    bundleId: bundle.id,
    shirtComponentId: shirtComponent.id,
    orderIds: [],
  };
  fixtures.push(fixture);
  return fixture;
}

function bundleRequest(
  fixture: Fixture,
  overrides: Partial<{
    quantity: number;
    bundleVersion: number;
    variantId: number;
    componentId: number;
  }> = {},
) {
  return {
    bundleId: fixture.bundleId,
    bundleVersion: overrides.bundleVersion ?? 1,
    quantity: overrides.quantity ?? 1,
    selections: [
      {
        componentId: overrides.componentId ?? fixture.shirtComponentId,
        productVariantId: overrides.variantId ?? fixture.shirtMediumId,
      },
    ],
  };
}

async function buy(
  fixture: Fixture,
  lines: Parameters<Actions["createOrderInTx"]>[1],
  bundles: Parameters<Actions["createOrderInTx"]>[5],
) {
  const result = await db().transaction((tx) =>
    createOrderInTx(
      tx as Parameters<Actions["createOrderInTx"]>[0],
      lines,
      fixture.userId,
      "buyer@example.test",
      "Buyer",
      bundles,
    ),
  );
  fixture.orderIds.push(result.orderId);
  return result;
}

async function stockOf(fixture: Fixture) {
  const productRows = await db()
    .select({ id: products.id, stock: products.stock })
    .from(products)
    .where(inArray(products.id, [fixture.toteId, fixture.stickersId]));
  const variantRows = await db()
    .select({ id: productVariants.id, stock: productVariants.stock })
    .from(productVariants)
    .where(
      inArray(productVariants.id, [fixture.shirtSmallId, fixture.shirtMediumId]),
    );
  const byId = new Map(
    [...productRows, ...variantRows].map((row) => [row.id, row.stock]),
  );
  return {
    small: byId.get(fixture.shirtSmallId),
    medium: byId.get(fixture.shirtMediumId),
    tote: byId.get(fixture.toteId),
    stickers: byId.get(fixture.stickersId),
  };
}

async function orderSnapshot(orderId: number) {
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId));
  const bundles = await db()
    .select()
    .from(orderBundles)
    .where(eq(orderBundles.orderId, orderId));
  const items = await db()
    .select({
      item: orderItems,
      allocation: orderBundleItems,
    })
    .from(orderItems)
    .leftJoin(orderBundleItems, eq(orderBundleItems.orderItemId, orderItems.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.id);
  return { order, bundles, items };
}

async function cleanupFixture(fixture: Fixture) {
  if (fixture.orderIds.length) {
    await db()
      .delete(orderEvents)
      .where(inArray(orderEvents.orderId, fixture.orderIds));
    await db()
      .delete(orderReturns)
      .where(inArray(orderReturns.orderId, fixture.orderIds));
    await db()
      .delete(orderAdjustments)
      .where(inArray(orderAdjustments.orderId, fixture.orderIds));
    await db().delete(orders).where(inArray(orders.id, fixture.orderIds));
  }
  await db().delete(merchBundles).where(eq(merchBundles.id, fixture.bundleId));
  await db()
    .delete(products)
    .where(
      inArray(products.id, [fixture.shirtId, fixture.toteId, fixture.stickersId]),
    );
  await db().delete(users).where(eq(users.id, fixture.userId));
}

describeDatabase("bundle checkout", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    ({ createOrderInTx, createGuestOrderInTx } = await import(
      "@/app/lib/orders/actions"
    ));
    ({ applyOrderAdjustmentWithDatabase } = await import(
      "@/app/lib/orders/adjustments"
    ));
    ({ restoreEffectiveOrderStockInTx } = await import(
      "@/app/lib/orders/cancellation"
    ));
  });

  afterEach(async () => {
    while (fixtures.length) await cleanupFixture(fixtures.pop()!);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("charges the fixed price and stores exact allocations that sum to it", async () => {
    const fixture = await createFixture();
    const result = await buy(fixture, [], [bundleRequest(fixture, { quantity: 2 })]);

    expect(result.totalAmount).toBe(300);
    expect(result.mappedProducts).toEqual([
      expect.objectContaining({
        name: expect.stringContaining("Combo Kit"),
        quantity: 2,
        price: 150,
        components: [
          expect.stringMatching(/^1 × Polera .* \(Talla: M\)$/),
          expect.stringMatching(/^1 × Tote/),
          expect.stringMatching(/^2 × Stickers/),
        ],
      }),
    ]);

    const snapshot = await orderSnapshot(result.orderId);
    expect(snapshot.order.totalAmount).toBe(300);
    expect(snapshot.bundles).toEqual([
      expect.objectContaining({
        bundleId: fixture.bundleId,
        bundleVersion: 1,
        quantity: 2,
        unitPriceCents: 15000,
        separateUnitPriceCents: 18000,
        totalCents: 30000,
      }),
    ]);
    const paidCents = snapshot.items.reduce(
      (sum, row) =>
        sum + row.allocation!.paidUnitPriceCents * row.item.quantity,
      0,
    );
    expect(paidCents).toBe(30000);
    for (const row of snapshot.items) {
      expect(row.allocation).not.toBeNull();
      expect(Math.round(row.item.priceAtPurchase * 100)).toBe(
        row.allocation!.paidUnitPriceCents,
      );
      expect(row.allocation!.paidUnitPriceCents).toBeLessThanOrEqual(
        row.allocation!.listUnitPriceCents,
      );
      expect(row.item.quantity).toBe(row.allocation!.unitsPerBundle * 2);
    }
    expect(
      snapshot.items.map((row) => [
        row.item.productId,
        row.item.productVariantId,
        row.item.quantity,
        row.allocation!.paidUnitPriceCents,
      ]),
    ).toEqual([
      // 83.33 and 8.33 per unit tie on remainders; the earlier component
      // takes the leftover cent.
      [fixture.shirtId, fixture.shirtMediumId, 2, 8334],
      [fixture.toteId, null, 2, 5000],
      [fixture.stickersId, null, 4, 833],
    ]);
    expect(await stockOf(fixture)).toEqual({
      small: 5,
      medium: 3,
      tote: 3,
      stickers: 6,
    });
  });

  it("keeps bundle components apart from identical individual lines", async () => {
    const fixture = await createFixture();
    const result = await buy(
      fixture,
      [{ productId: fixture.toteId, productVariantId: null, quantity: 1 }],
      [bundleRequest(fixture)],
    );
    expect(result.totalAmount).toBe(210);
    const snapshot = await orderSnapshot(result.orderId);
    const totes = snapshot.items.filter(
      (row) => row.item.productId === fixture.toteId,
    );
    expect(totes).toHaveLength(2);
    expect(totes.map((row) => row.item.priceAtPurchase).sort()).toEqual([
      50, 60,
    ]);
    expect(totes.filter((row) => row.allocation == null)).toHaveLength(1);
    expect((await stockOf(fixture)).tote).toBe(3);
  });

  it("rejects combined demand above stock across bundles and individual lines", async () => {
    const fixture = await createFixture({ tote: 2 });
    await expect(
      buy(
        fixture,
        [{ productId: fixture.toteId, productVariantId: null, quantity: 1 }],
        [bundleRequest(fixture), bundleRequest(fixture, { variantId: fixture.shirtSmallId })],
      ),
    ).rejects.toMatchObject({ cause: "stock_insufficient" });
    expect(await stockOf(fixture)).toEqual({
      small: 5,
      medium: 5,
      tote: 2,
      stickers: 10,
    });
  });

  it("sells the last component to only one of two concurrent checkouts", async () => {
    const fixture = await createFixture({ tote: 1 });
    const attempts = await Promise.allSettled([
      buy(fixture, [], [bundleRequest(fixture)]),
      buy(fixture, [], [bundleRequest(fixture, { variantId: fixture.shirtSmallId })]),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((a) => a.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      cause: "stock_insufficient",
    });
    const stock = await stockOf(fixture);
    expect(stock.tote).toBe(0);
    expect(stock.stickers).toBe(8);
    expect((stock.small ?? 0) + (stock.medium ?? 0)).toBe(9);
  });

  it("rejects stale versions, tampered choices and invalid quantities", async () => {
    const fixture = await createFixture();
    await expect(
      buy(fixture, [], [bundleRequest(fixture, { bundleVersion: 2 })]),
    ).rejects.toMatchObject({ cause: "bundle_changed" });
    await expect(
      buy(fixture, [], [bundleRequest(fixture, { componentId: 999999999 })]),
    ).rejects.toMatchObject({ cause: "bundle_changed" });
    await expect(
      buy(fixture, [], [
        { ...bundleRequest(fixture), selections: [] },
      ]),
    ).rejects.toMatchObject({ cause: "bundle_changed" });
    await expect(
      buy(fixture, [], [bundleRequest(fixture, { quantity: 50 })]),
    ).rejects.toMatchObject({ cause: "invalid_quantity" });
    expect((await stockOf(fixture)).tote).toBe(5);
  });

  it("rejects hidden variants, hidden products and bundles no longer discounted", async () => {
    const fixture = await createFixture();
    await db()
      .update(productVariants)
      .set({ isVisible: false })
      .where(eq(productVariants.id, fixture.shirtMediumId));
    await expect(
      buy(fixture, [], [bundleRequest(fixture)]),
    ).rejects.toMatchObject({ cause: "bundle_changed" });
    // The other size still sells.
    await buy(fixture, [], [
      bundleRequest(fixture, { variantId: fixture.shirtSmallId }),
    ]);

    await db()
      .update(products)
      .set({ discount: 50, discountUnit: "percentage" })
      .where(eq(products.id, fixture.shirtId));
    // Bs50 + Bs60 + Bs20 = Bs130 < Bs150: no longer a discount.
    await expect(
      buy(fixture, [], [
        bundleRequest(fixture, { variantId: fixture.shirtSmallId }),
      ]),
    ).rejects.toMatchObject({ cause: "bundle_unavailable" });

    await db()
      .update(products)
      .set({ discount: 0, isVisible: false })
      .where(eq(products.id, fixture.toteId));
    await expect(
      buy(fixture, [], [
        bundleRequest(fixture, { variantId: fixture.shirtSmallId }),
      ]),
    ).rejects.toMatchObject({ cause: "bundle_unavailable" });

    await db()
      .update(merchBundles)
      .set({ isVisible: false })
      .where(eq(merchBundles.id, fixture.bundleId));
    await expect(
      buy(fixture, [], [
        bundleRequest(fixture, { variantId: fixture.shirtSmallId }),
      ]),
    ).rejects.toMatchObject({ cause: "bundle_unavailable" });
  });

  it("creates guest orders with the same snapshots", async () => {
    const fixture = await createFixture();
    const result = await db().transaction((tx) =>
      createGuestOrderInTx(
        tx as Parameters<Actions["createGuestOrderInTx"]>[0],
        [],
        "Guest",
        "guest@example.test",
        "+59170000000",
        [bundleRequest(fixture)],
      ),
    );
    fixture.orderIds.push(result.orderId);
    expect(result.totalAmount).toBe(150);
    const snapshot = await orderSnapshot(result.orderId);
    expect(snapshot.order.totalAmount).toBe(150);
    expect(snapshot.bundles).toHaveLength(1);
    expect(snapshot.items.every((row) => row.allocation != null)).toBe(true);
  });

  it("restores every component once on cancellation", async () => {
    const fixture = await createFixture();
    const before = await stockOf(fixture);
    const result = await buy(fixture, [], [bundleRequest(fixture, { quantity: 2 })]);
    await db().transaction((tx) =>
      restoreEffectiveOrderStockInTx(
        tx as Parameters<typeof restoreEffectiveOrderStockInTx>[0],
        result.orderId,
      ),
    );
    expect(await stockOf(fixture)).toEqual(before);
  });

  it("refunds a returned component at its paid allocation, not its list price", async () => {
    const fixture = await createFixture();
    const result = await buy(fixture, [], [bundleRequest(fixture)]);
    await db()
      .update(orders)
      .set({ status: "paid" })
      .where(eq(orders.id, result.orderId));
    const snapshot = await orderSnapshot(result.orderId);
    const shirtLine = snapshot.items.find(
      (row) => row.item.productId === fixture.shirtId,
    )!;
    const adjustment = await applyOrderAdjustmentWithDatabase(
      db() as Parameters<typeof applyOrderAdjustmentWithDatabase>[0],
      {
        orderId: result.orderId,
        actorUserId: fixture.userId,
        actorRole: "admin",
        expectedRevision: snapshot.order.revision,
        reason: "Devolución: talla equivocada",
        allowedStatuses: ["paid", "delivered"],
        items: [{ baseOrderItemId: shirtLine.item.id, quantityDelta: -1 }],
      },
    );
    expect(adjustment.totalDelta).toBeCloseTo(-83.34, 2);
    expect(adjustment.newTotal).toBeCloseTo(66.66, 2);
    expect((await stockOf(fixture)).medium).toBe(5);
  });
});
