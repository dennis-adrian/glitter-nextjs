// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
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
  cartBundles,
  carts,
  merchBundleCollections,
  merchBundleComponents,
  merchBundleComponentVariants,
  merchBundles,
  merchCollections,
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

const session = vi.hoisted(() => ({
  profile: null as null | {
    id: number;
    role: "admin" | "user";
    clerkId: string;
    email: string;
    status: "verified";
    displayName: string;
    firstName: string | null;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => session.profile,
  getCurrentBaseProfile: async () => session.profile,
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 6 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/orders/actions");
let createOrderInTx: Actions["createOrderInTx"];
let createGuestOrderInTx: Actions["createGuestOrderInTx"];
let applyOrderAdjustmentWithDatabase: (typeof import("@/app/lib/orders/adjustments"))["applyOrderAdjustmentWithDatabase"];
let restoreEffectiveOrderStockInTx: (typeof import("@/app/lib/orders/cancellation"))["restoreEffectiveOrderStockInTx"];
let updateOrder: Actions["updateOrder"];
let fetchOrder: Actions["fetchOrder"];
let saveMerchBundle: (typeof import("@/app/lib/merch/bundle-actions"))["saveMerchBundle"];
let resolveCartBundleLines: (typeof import("@/app/lib/merch/bundles"))["resolveCartBundleLines"];
let fetchMerchCollections: (typeof import("@/app/lib/merch/collections"))["fetchMerchCollections"];
let cartActions: typeof import("@/app/lib/cart/actions");
let deleteProduct: (typeof import("@/app/lib/products/actions"))["deleteProduct"];

type Fixture = {
  userId: number;
  userClerkId: string;
  userEmail: string;
  extraBundleIds: number[];
  collectionIds: number[];
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
  stock: {
    small?: number;
    medium?: number;
    tote?: number;
    stickers?: number;
  } = {},
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
      {
        bundleId: bundle.id,
        productId: stickers.id,
        quantity: 2,
        sortOrder: 2,
      },
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
    userClerkId: user.clerkId,
    userEmail: user.email,
    extraBundleIds: [],
    collectionIds: [],
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
      inArray(productVariants.id, [
        fixture.shirtSmallId,
        fixture.shirtMediumId,
      ]),
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
  const [order] = await db()
    .select()
    .from(orders)
    .where(eq(orders.id, orderId));
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
  await db()
    .delete(merchBundles)
    .where(
      inArray(merchBundles.id, [fixture.bundleId, ...fixture.extraBundleIds]),
    );
  if (fixture.collectionIds.length) {
    await db()
      .delete(merchCollections)
      .where(inArray(merchCollections.id, fixture.collectionIds));
  }
  await db()
    .delete(products)
    .where(
      inArray(products.id, [
        fixture.shirtId,
        fixture.toteId,
        fixture.stickersId,
      ]),
    );
  await db().delete(users).where(eq(users.id, fixture.userId));
}

describeDatabase("bundle checkout", () => {
  beforeAll(async () => {
    // Forced, not `??=`: `node --env-file-if-exists=.env.local` has already
    // set POSTGRES_URL, and the production modules below (saveMerchBundle,
    // deleteProduct, checkoutCart…) query `@/db`, not the fixture pool.
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    // `@/db` keeps its pool on `globalThis` and reads the URL once, so a pool
    // or env parse from before the assignment above would still win.
    const { pool: appPool } = await import("@/db");
    const appPoolUrl = (appPool as Pool & { options: PoolConfig }).options
      .connectionString;
    if (appPoolUrl !== testDatabaseUrl) {
      throw new Error(
        "The app's database pool does not target TEST_DATABASE_URL; refusing to run production modules against it.",
      );
    }
    ({ createOrderInTx, createGuestOrderInTx } =
      await import("@/app/lib/orders/actions"));
    ({ applyOrderAdjustmentWithDatabase } =
      await import("@/app/lib/orders/adjustments"));
    ({ restoreEffectiveOrderStockInTx } =
      await import("@/app/lib/orders/cancellation"));
    ({ updateOrder, fetchOrder } = await import("@/app/lib/orders/actions"));
    ({ saveMerchBundle } = await import("@/app/lib/merch/bundle-actions"));
    ({ resolveCartBundleLines } = await import("@/app/lib/merch/bundles"));
    ({ fetchMerchCollections } = await import("@/app/lib/merch/collections"));
    cartActions = await import("@/app/lib/cart/actions");
    ({ deleteProduct } = await import("@/app/lib/products/actions"));
  });

  afterEach(async () => {
    session.profile = null;
    while (fixtures.length) await cleanupFixture(fixtures.pop()!);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("charges the fixed price and stores exact allocations that sum to it", async () => {
    const fixture = await createFixture();
    const result = await buy(
      fixture,
      [],
      [bundleRequest(fixture, { quantity: 2 })],
    );

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
        [
          bundleRequest(fixture),
          bundleRequest(fixture, { variantId: fixture.shirtSmallId }),
        ],
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
      buy(
        fixture,
        [],
        [bundleRequest(fixture, { variantId: fixture.shirtSmallId })],
      ),
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
      buy(fixture, [], [{ ...bundleRequest(fixture), selections: [] }]),
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
    await buy(
      fixture,
      [],
      [bundleRequest(fixture, { variantId: fixture.shirtSmallId })],
    );

    await db()
      .update(products)
      .set({ discount: 50, discountUnit: "percentage" })
      .where(eq(products.id, fixture.shirtId));
    // Bs50 + Bs60 + Bs20 = Bs130 < Bs150: no longer a discount.
    await expect(
      buy(
        fixture,
        [],
        [bundleRequest(fixture, { variantId: fixture.shirtSmallId })],
      ),
    ).rejects.toMatchObject({ cause: "bundle_unavailable" });

    // Every rule below is the only one broken when it is checked, and the
    // bundle sells before it, so no other rule can produce the rejection.
    await db()
      .update(products)
      .set({ discount: 0 })
      .where(eq(products.id, fixture.shirtId));
    await buy(
      fixture,
      [],
      [bundleRequest(fixture, { variantId: fixture.shirtSmallId })],
    );

    await db()
      .update(products)
      .set({ isVisible: false })
      .where(eq(products.id, fixture.toteId));
    await expect(
      buy(
        fixture,
        [],
        [bundleRequest(fixture, { variantId: fixture.shirtSmallId })],
      ),
    ).rejects.toMatchObject({
      cause: "bundle_unavailable",
      message: expect.stringMatching(/^El combo ".+" ya no está disponible\.$/),
    });
    // Checkout reports every catalog issue the same way; the evaluation it
    // runs names the one that failed.
    const { loadBundleCatalog, loadBundleRecords } =
      await import("@/app/lib/merch/bundles");
    const { evaluateBundle } = await import("@/app/lib/merch/bundle-pricing");
    const [record] = await loadBundleRecords(db(), { ids: [fixture.bundleId] });
    const evaluation = evaluateBundle(
      record,
      await loadBundleCatalog(db(), [
        fixture.shirtId,
        fixture.toteId,
        fixture.stickersId,
      ]),
      { mode: "sale" },
    );
    expect(evaluation.issues.map((issue) => issue.code)).toEqual([
      "product_hidden",
    ]);

    await db()
      .update(products)
      .set({ isVisible: true })
      .where(eq(products.id, fixture.toteId));
    await db()
      .update(merchBundles)
      .set({ isVisible: false })
      .where(eq(merchBundles.id, fixture.bundleId));
    await expect(
      buy(
        fixture,
        [],
        [bundleRequest(fixture, { variantId: fixture.shirtSmallId })],
      ),
    ).rejects.toMatchObject({
      cause: "bundle_unavailable",
      // The unpublished-bundle branch, not a catalog issue.
      message: "Un combo de tu carrito ya no está disponible.",
    });
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
    const result = await buy(
      fixture,
      [],
      [bundleRequest(fixture, { quantity: 2 })],
    );
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

  function signIn(fixture: Fixture, role: "admin" | "user" = "user") {
    session.profile = {
      id: fixture.userId,
      role,
      clerkId: fixture.userClerkId,
      email: fixture.userEmail,
      status: "verified",
      displayName: "Bundle Buyer",
      firstName: null,
    };
  }

  function adminInput(
    fixture: Fixture,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      name: "Kit admin",
      slug: `kit-admin-${fixture.userId}`,
      description: "",
      imageUrl: "",
      price: 150,
      isVisible: true,
      sortOrder: 1,
      collectionIds: [],
      components: [
        {
          productId: fixture.shirtId,
          quantity: 1,
          variantIds: [fixture.shirtSmallId, fixture.shirtMediumId],
        },
        { productId: fixture.toteId, quantity: 1, variantIds: [] },
      ],
      ...overrides,
    };
  }

  async function bundleRow(id: number) {
    const [row] = await db()
      .select()
      .from(merchBundles)
      .where(eq(merchBundles.id, id));
    return row;
  }

  it("publishes only valid bundles and versions commercial changes", async () => {
    const fixture = await createFixture();
    signIn(fixture, "admin");

    const tooSmall = await saveMerchBundle(
      adminInput(fixture, {
        components: [
          { productId: fixture.toteId, quantity: 2, variantIds: [] },
        ],
      }),
    );
    expect(tooSmall).toMatchObject({
      success: false,
      message: expect.stringContaining("dos productos distintos"),
    });
    const notDiscounted = await saveMerchBundle(
      adminInput(fixture, { price: 160 }),
    );
    expect(notDiscounted).toMatchObject({
      success: false,
      message: expect.stringContaining("menor que comprar"),
    });

    // Drafts may be incomplete.
    const draft = await saveMerchBundle(
      adminInput(fixture, { price: 160, isVisible: false }),
    );
    expect(draft.success).toBe(true);
    fixture.extraBundleIds.push(draft.bundleId!);
    expect((await bundleRow(draft.bundleId!)).version).toBe(1);

    const [record] = await db()
      .select()
      .from(merchBundleComponents)
      .where(eq(merchBundleComponents.bundleId, draft.bundleId!))
      .orderBy(merchBundleComponents.sortOrder);
    const withIds = (overrides: Record<string, unknown>) =>
      adminInput(fixture, {
        id: draft.bundleId,
        components: [
          {
            id: record.id,
            productId: fixture.shirtId,
            quantity: 1,
            variantIds: [fixture.shirtSmallId, fixture.shirtMediumId],
          },
          { productId: fixture.toteId, quantity: 1, variantIds: [] },
        ],
        ...overrides,
      });

    const published = await saveMerchBundle(withIds({ price: 150 }));
    expect(published.success).toBe(true);
    const afterPrice = await bundleRow(draft.bundleId!);
    expect(afterPrice).toMatchObject({ isVisible: true, price: 150 });
    // The tote component was re-created (no id sent), so contents changed too.
    expect(afterPrice.version).toBe(2);

    const components = await db()
      .select()
      .from(merchBundleComponents)
      .where(eq(merchBundleComponents.bundleId, draft.bundleId!))
      .orderBy(merchBundleComponents.sortOrder);
    const stableInput = (overrides: Record<string, unknown>) =>
      adminInput(fixture, {
        id: draft.bundleId,
        components: [
          {
            id: components[0].id,
            productId: fixture.shirtId,
            quantity: 1,
            variantIds: [fixture.shirtSmallId, fixture.shirtMediumId],
          },
          {
            id: components[1].id,
            productId: fixture.toteId,
            quantity: 1,
            variantIds: [],
          },
        ],
        ...overrides,
      });
    expect(
      (await saveMerchBundle(stableInput({ name: "Otro nombre" }))).success,
    ).toBe(true);
    expect((await bundleRow(draft.bundleId!)).version).toBe(2);
    expect((await saveMerchBundle(stableInput({ price: 140 }))).success).toBe(
      true,
    );
    expect((await bundleRow(draft.bundleId!)).version).toBe(3);

    const foreignVariant = await saveMerchBundle(
      adminInput(fixture, {
        slug: `kit-foreign-${fixture.userId}`,
        components: [
          {
            productId: fixture.toteId,
            quantity: 1,
            variantIds: [fixture.shirtSmallId],
          },
          { productId: fixture.stickersId, quantity: 1, variantIds: [] },
        ],
      }),
    );
    expect(foreignVariant).toMatchObject({
      success: false,
      message: expect.stringContaining("no pertenece"),
    });
    const duplicateSlug = await saveMerchBundle(
      adminInput(fixture, { slug: `kit-admin-${fixture.userId}` }),
    );
    expect(duplicateSlug).toMatchObject({
      success: false,
      message: expect.stringContaining("URL"),
    });
  });

  it("refuses to delete products and variants that bundles use", async () => {
    const fixture = await createFixture();
    signIn(fixture, "admin");
    const result = await deleteProduct(fixture.toteId);
    expect(result).toMatchObject({
      success: false,
      message: expect.stringContaining("forma parte del combo"),
    });
    await expect(
      db()
        .delete(productVariants)
        .where(eq(productVariants.id, fixture.shirtSmallId)),
    ).rejects.toThrow();
  });

  it("flags stale, unavailable and over-demanded cart bundles", async () => {
    const fixture = await createFixture({ tote: 2 });
    const request = (
      key: string,
      overrides: Partial<{
        bundleVersion: number;
        quantity: number;
        variantId: number;
      }> = {},
    ) => ({
      key,
      cartBundleId: null,
      bundleId: fixture.bundleId,
      bundleVersion: overrides.bundleVersion ?? 1,
      quantity: overrides.quantity ?? 1,
      selections: [
        {
          componentId: fixture.shirtComponentId,
          productVariantId: overrides.variantId ?? fixture.shirtMediumId,
        },
      ],
    });

    const [fresh] = await resolveCartBundleLines([request("a")], []);
    expect(fresh).toMatchObject({
      issue: null,
      unitPriceCents: 15000,
      separateUnitPriceCents: 18000,
      maxQuantity: 2,
    });

    // One tote already taken by an individual line leaves a single bundle.
    const [shared] = await resolveCartBundleLines(
      [request("a", { quantity: 2 })],
      [{ productId: fixture.toteId, productVariantId: null, quantity: 1 }],
    );
    expect(shared).toMatchObject({
      issue: "stock_insufficient",
      maxQuantity: 1,
    });

    // Two bundle lines cannot both count on the last totes.
    const competing = await resolveCartBundleLines(
      [
        request("a", { quantity: 2 }),
        request("b", { variantId: fixture.shirtSmallId }),
      ],
      [],
    );
    expect(competing.map((line) => line.issue)).toEqual([
      "stock_insufficient",
      "out_of_stock",
    ]);

    await db()
      .update(merchBundles)
      .set({ version: 2, price: 140 })
      .where(eq(merchBundles.id, fixture.bundleId));
    const [stale] = await resolveCartBundleLines([request("a")], []);
    expect(stale).toMatchObject({
      issue: "stale",
      currentVersion: 2,
      unitPriceCents: 14000,
    });

    await db()
      .update(productVariants)
      .set({ isVisible: false })
      .where(eq(productVariants.id, fixture.shirtMediumId));
    const [hiddenChoice] = await resolveCartBundleLines(
      [request("a", { bundleVersion: 2 })],
      [],
    );
    expect(hiddenChoice.issue).toBe("selection_invalid");

    await db()
      .update(merchBundles)
      .set({ isVisible: false })
      .where(eq(merchBundles.id, fixture.bundleId));
    const [unpublished] = await resolveCartBundleLines(
      [request("a", { bundleVersion: 2, variantId: fixture.shirtSmallId })],
      [],
    );
    expect(unpublished).toMatchObject({
      issue: "unavailable",
      // Anonymous ids never expose a draft's name or price.
      name: "Combo no disponible",
      unitPriceCents: 0,
    });
    const [stored] = await resolveCartBundleLines(
      [request("a", { bundleVersion: 2, variantId: fixture.shirtSmallId })],
      [],
      { revealUnpublished: true },
    );
    expect(stored).toMatchObject({
      issue: "unavailable",
      name: expect.stringContaining("Kit"),
    });
  });

  it("checks out an authenticated cart holding bundles and clears it", async () => {
    const fixture = await createFixture({ tote: 3 });
    signIn(fixture);
    const add = (quantity: number, bundleVersion = 1) =>
      cartActions.addBundleToCart({
        bundleId: fixture.bundleId,
        bundleVersion,
        quantity,
        selections: [
          {
            componentId: fixture.shirtComponentId,
            productVariantId: fixture.shirtMediumId,
          },
        ],
      });

    expect(await add(2)).toMatchObject({ success: true, newCount: 2 });
    // Merges into the same line and caps at the three available totes.
    expect(await add(4)).toMatchObject({ success: true, newCount: 3 });
    expect(await add(1)).toMatchObject({ success: false });
    expect(await add(1, 99)).toMatchObject({
      success: false,
      message: expect.stringContaining("cambió"),
    });

    // Individual lines are capped by what the bundles already reserve.
    const individual = await cartActions.addToCart({
      productId: fixture.toteId,
      productVariantId: null,
      quantity: 1,
    });
    expect(individual).toMatchObject({ success: false });

    const cart = await cartActions.fetchCartWithItems();
    expect(cart.data?.bundles).toEqual([
      expect.objectContaining({ quantity: 3, issue: null, maxQuantity: 3 }),
    ]);

    const checkout = await cartActions.checkoutCart();
    expect(checkout).toMatchObject({ success: true });
    fixture.orderIds.push(checkout.orderId!);
    const order = await fetchOrder(checkout.orderId!);
    expect(order?.totalAmount).toBe(450);
    expect(order?.bundles?.[0]).toMatchObject({
      quantity: 3,
      totalCents: 45000,
    });
    const [userCart] = await db()
      .select()
      .from(carts)
      .where(eq(carts.userId, fixture.userId));
    expect(
      await db()
        .select()
        .from(cartBundles)
        .where(eq(cartBundles.cartId, userCart.id)),
    ).toEqual([]);
    expect(await stockOf(fixture)).toMatchObject({
      medium: 2,
      tote: 0,
      stickers: 4,
    });
  });

  it("rejects guest checkout of a bundle that changed", async () => {
    const fixture = await createFixture();
    await db()
      .update(merchBundles)
      .set({ version: 2 })
      .where(eq(merchBundles.id, fixture.bundleId));
    const result = await cartActions.checkoutGuestCart(
      [],
      "Invitada",
      "guest@example.test",
      "+59170000000",
      [{ lineKey: "k", ...bundleRequest(fixture) }],
    );
    expect(result).toMatchObject({
      success: false,
      message: expect.stringContaining("cambió"),
    });
    expect((await stockOf(fixture)).tote).toBe(5);
  });

  it("lets customers remove whole bundles but not single components", async () => {
    const fixture = await createFixture();
    const result = await buy(
      fixture,
      [],
      [bundleRequest(fixture, { quantity: 2 })],
    );
    signIn(fixture);
    const order = (await fetchOrder(result.orderId))!;
    const component = order.orderItems[0];

    const partial = await updateOrder(
      result.orderId,
      fixture.userId,
      [{ orderItemId: component.id, quantity: component.quantity - 1 }],
      order.updatedAt.toISOString(),
    );
    expect(partial).toMatchObject({ success: false, cause: "forbidden" });

    const increase = await updateOrder(
      result.orderId,
      fixture.userId,
      [],
      order.updatedAt.toISOString(),
      [{ orderBundleId: order.bundles![0].id, quantity: 3 }],
    );
    expect(increase).toMatchObject({ success: false, cause: "forbidden" });

    const removal = await updateOrder(
      result.orderId,
      fixture.userId,
      [],
      order.updatedAt.toISOString(),
      [{ orderBundleId: order.bundles![0].id, quantity: 1 }],
    );
    expect(removal).toMatchObject({ success: true });
    const updated = (await fetchOrder(result.orderId))!;
    expect(updated.totalAmount).toBe(150);
    expect(
      updated.orderItems.reduce(
        (sum, item) =>
          sum + Math.round(item.priceAtPurchase * 100) * item.quantity,
        0,
      ),
    ).toBe(15000);
    expect(await stockOf(fixture)).toEqual({
      small: 5,
      medium: 4,
      tote: 4,
      stickers: 8,
    });
  });

  it("lists collections that only hold bundles", async () => {
    const fixture = await createFixture();
    const [collection] = await db()
      .insert(merchCollections)
      .values({
        name: "Solo combos",
        slug: `solo-combos-${fixture.userId}`,
        isVisible: true,
      })
      .returning();
    fixture.collectionIds.push(collection.id);
    await db()
      .insert(merchBundleCollections)
      .values({ bundleId: fixture.bundleId, collectionId: collection.id });

    const listed = (await fetchMerchCollections()).find(
      (entry) => entry.id === collection.id,
    );
    expect(listed).toMatchObject({
      productIds: [],
      bundleIds: [fixture.bundleId],
    });

    await db()
      .update(merchBundles)
      .set({ isVisible: false })
      .where(eq(merchBundles.id, fixture.bundleId));
    expect(
      (await fetchMerchCollections()).some(
        (entry) => entry.id === collection.id,
      ),
    ).toBe(false);
  });

  it("seeds combos with visible sizes only", async () => {
    const { seedMerch } = await import("@/scripts/seed/merch");
    // The seed refuses anything but a development Clerk key.
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_integration");
    const rollback = new Error("rollback");
    try {
      // Rolled back: the seed's fixtures must not outlive this test.
      await db().transaction(async (tx) => {
        // A database seeded before combos existed keeps its polera, reused
        // unchanged, and an admin has since hidden one of its sizes.
        const [polera] = await tx
          .insert(products)
          .values({
            name: "Polera Glitter Club",
            slug: "demo-merch-polera",
            price: 100,
            stock: 0,
            storeCategory: "merch",
          })
          .returning();
        const [visible] = await tx
          .insert(productVariants)
          .values([
            { productId: polera.id, stock: 8, sortOrder: 0 },
            { productId: polera.id, stock: 8, sortOrder: 1, isVisible: false },
          ])
          .returning();

        await seedMerch(tx as unknown as Parameters<typeof seedMerch>[0]);

        // Only the Kit Clásicos combo holds the polera.
        const eligible = await tx
          .select({ variantId: merchBundleComponentVariants.variantId })
          .from(merchBundleComponentVariants)
          .where(eq(merchBundleComponentVariants.productId, polera.id));
        expect(eligible).toEqual([{ variantId: visible.id }]);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
