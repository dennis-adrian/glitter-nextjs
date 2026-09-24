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
    const appPoolUrl = (
      appPool as unknown as { options: { connectionString?: string } }
    ).options.connectionString;
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
    // The production modules' pool, opened by the guard in beforeAll.
    await (await import("@/db")).pool.end();
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

  it("seeds combos with visible sizes only", async () => {
    const { seedMerch } = await import("@/scripts/seed/merch");
    // The seed skips fixtures that already exist, so a seeded test database
    // would test nothing (or collide on the polera's slug below).
    const { rows: seeded } = await pool!.query(
      `select 1 from products where slug like 'demo-merch-%'
       union all
       select 1 from merch_bundles where slug = 'demo-kit-clasicos'`,
    );
    if (seeded.length) {
      throw new Error(
        "The test database holds demo merch from `pnpm seed`; recreate it before running this suite.",
      );
    }
    // The seed refuses anything but a development Clerk key, and whatever
    // .env.local says about production or opting out.
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_integration");
    vi.stubEnv("ALLOW_DEV_SEED", "true");
    vi.stubEnv("VERCEL_ENV", "development");
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

  it("indexes every bundle foreign key by its leading column", async () => {
    // Postgres does not index referencing columns. Without one, every delete
    // of a parent row scans the child table to cascade or restrict it.
    const { rows } = await pool!.query<{ name: string }>(
      `select c.conname as name
         from pg_constraint c
        where c.contype = 'f'
          and c.conrelid::regclass::text = any($1)
          and not exists (
            select 1 from pg_index i
             where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
          )`,
      [
        [
          "merch_bundles",
          "merch_bundle_components",
          "merch_bundle_component_variants",
          "merch_bundle_collections",
          "cart_bundles",
          "cart_bundle_selections",
          "order_bundles",
          "order_bundle_items",
        ],
      ],
    );
    expect(rows).toEqual([]);
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

  /** The save token an editor opened now would send back. */
  async function revisionOf(id: number) {
    const { bundleRevisionSql } = await import("@/app/lib/merch/bundles");
    const [row] = await db()
      .select({ revision: bundleRevisionSql() })
      .from(merchBundles)
      .where(eq(merchBundles.id, id));
    return row.revision;
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

    const published = await saveMerchBundle(
      withIds({ price: 150, revision: await revisionOf(draft.bundleId!) }),
    );
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
      (
        await saveMerchBundle(
          stableInput({
            name: "Otro nombre",
            revision: await revisionOf(draft.bundleId!),
          }),
        )
      ).success,
    ).toBe(true);
    expect((await bundleRow(draft.bundleId!)).version).toBe(2);
    expect(
      (
        await saveMerchBundle(
          stableInput({
            price: 140,
            revision: await revisionOf(draft.bundleId!),
          }),
        )
      ).success,
    ).toBe(true);
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
      // Carts never expose a draft's name or price.
      name: "Combo no disponible",
      unitPriceCents: 0,
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

  /**
   * Shirt Bs25 + tote Bs20 + 2 × stickers Bs10 sold for Bs50. The paid
   * allocations (19.23, 15.39, 7.69 × 2) add up to 50.00000000000001 in
   * floating point, so money has to be summed in cents.
   */
  async function createUnevenFixture() {
    const fixture = await createFixture();
    await db()
      .update(products)
      .set({ price: 25 })
      .where(eq(products.id, fixture.shirtId));
    await db()
      .update(products)
      .set({ price: 20 })
      .where(eq(products.id, fixture.toteId));
    await db()
      .update(merchBundles)
      .set({ price: 50 })
      .where(eq(merchBundles.id, fixture.bundleId));
    return fixture;
  }

  it("cancels the order when the customer removes its only bundle", async () => {
    const fixture = await createUnevenFixture();
    const before = await stockOf(fixture);
    const result = await buy(fixture, [], [bundleRequest(fixture)]);
    const bought = await orderSnapshot(result.orderId);
    expect(bought.order.totalAmount).toBe(50);
    expect(
      bought.items.map((row) => row.allocation!.paidUnitPriceCents),
    ).toEqual([1923, 1539, 769]);

    signIn(fixture);
    const order = (await fetchOrder(result.orderId))!;
    const removal = await updateOrder(
      result.orderId,
      fixture.userId,
      [],
      order.updatedAt.toISOString(),
      [{ orderBundleId: order.bundles![0].id, quantity: 0 }],
    );

    expect(removal).toMatchObject({ success: true, wasCancelled: true });
    const after = await orderSnapshot(result.orderId);
    expect(after.order).toMatchObject({
      status: "cancelled",
      totalAmount: 0,
      revision: 3,
    });
    const [adjustment] = await db()
      .select()
      .from(orderAdjustments)
      .where(eq(orderAdjustments.orderId, result.orderId));
    expect(adjustment).toMatchObject({
      previousTotal: 50,
      totalDelta: -50,
      newTotal: 0,
    });
    const events = await db()
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, result.orderId))
      .orderBy(orderEvents.id);
    expect(events.map(({ type, revision }) => [type, revision])).toEqual([
      ["created", 1],
      ["adjusted", 2],
      ["cancelled", 3],
    ]);
    // Removing the bundle returned its stock; cancelling returns none again.
    expect(await stockOf(fixture)).toEqual(before);
  });

  it("returns every component of a bundle-only order with an exact refund", async () => {
    const fixture = await createUnevenFixture();
    const result = await buy(fixture, [], [bundleRequest(fixture)]);
    await db()
      .update(orders)
      .set({ status: "paid" })
      .where(eq(orders.id, result.orderId));
    signIn(fixture, "admin");
    const { adminReturnOrder } = await import("@/app/lib/orders/actions");
    const order = (await fetchOrder(result.orderId))!;

    const returned = await adminReturnOrder({
      orderId: result.orderId,
      items: order.orderItems.map((item) => ({
        orderItemId: item.id,
        quantity: item.quantity,
      })),
      reason: "Devolución completa",
      expectedRevision: order.revision,
    });

    expect(returned).toMatchObject({ success: true, refundAmount: 50 });
    const after = await orderSnapshot(result.orderId);
    expect(after.order).toMatchObject({ status: "paid", totalAmount: 0 });
    const [returnRecord] = await db()
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.orderId, result.orderId));
    expect(returnRecord.refundAmount).toBe(50);
  });

  it("lets an admin reduce every component of a bundle-only order to zero", async () => {
    const fixture = await createUnevenFixture();
    const before = await stockOf(fixture);
    const result = await buy(fixture, [], [bundleRequest(fixture)]);
    signIn(fixture, "admin");
    const { adminAdjustOrder } = await import("@/app/lib/orders/actions");
    const order = (await fetchOrder(result.orderId))!;

    const adjusted = await adminAdjustOrder({
      orderId: result.orderId,
      items: order.orderItems.map((item) => ({
        orderItemId: item.id,
        quantity: 0,
      })),
      additions: [],
      expectedRevision: order.revision,
      reason: "Sin stock para entregar",
    });

    expect(adjusted).toMatchObject({ success: true });
    const after = await orderSnapshot(result.orderId);
    // Only customer edits cancel an emptied order; the admin decides here.
    expect(after.order).toMatchObject({ status: "pending", totalAmount: 0 });
    const [adjustment] = await db()
      .select()
      .from(orderAdjustments)
      .where(eq(orderAdjustments.orderId, result.orderId));
    expect(adjustment).toMatchObject({ totalDelta: -50, newTotal: 0 });
    expect(await stockOf(fixture)).toEqual(before);
  });

  it("records returned bundle components at their paid allocation", async () => {
    const fixture = await createFixture();
    const result = await buy(fixture, [], [bundleRequest(fixture)]);
    await db()
      .update(orders)
      .set({ status: "delivered" })
      .where(eq(orders.id, result.orderId));
    signIn(fixture, "admin");
    const { adminReturnOrder } = await import("@/app/lib/orders/actions");
    const order = (await fetchOrder(result.orderId))!;
    const shirt = order.orderItems.find(
      (item) => item.productId === fixture.shirtId,
    )!;
    const stickers = order.orderItems.find(
      (item) => item.productId === fixture.stickersId,
    )!;

    const returned = await adminReturnOrder({
      orderId: result.orderId,
      items: [
        { orderItemId: shirt.id, quantity: 1 },
        { orderItemId: stickers.id, quantity: 1 },
      ],
      reason: "Talla equivocada",
      expectedRevision: order.revision,
    });

    // 83.34 for the shirt plus 8.33 for one sticker, not their list prices.
    expect(returned).toMatchObject({ success: true, refundAmount: 91.67 });
    const [returnRecord] = await db()
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.orderId, result.orderId));
    expect(returnRecord).toMatchObject({
      status: "received",
      reason: "Talla equivocada",
      refundAmount: 91.67,
    });
    const returnItems = await db()
      .select()
      .from(schema.orderReturnItems)
      .where(eq(schema.orderReturnItems.returnId, returnRecord.id))
      .orderBy(schema.orderReturnItems.id);
    const allocations = new Map(
      (await orderSnapshot(result.orderId)).items.map((row) => [
        row.item.id,
        row.allocation!.paidUnitPriceCents,
      ]),
    );
    expect(
      returnItems.map((item) => [
        item.orderItemId,
        item.productId,
        item.quantity,
        Math.round(item.unitPriceSnapshot * 100),
      ]),
    ).toEqual([
      [shirt.id, fixture.shirtId, 1, allocations.get(shirt.id)],
      [stickers.id, fixture.stickersId, 1, allocations.get(stickers.id)],
    ]);
    expect(
      returnItems.reduce(
        (sum, item) =>
          sum + Math.round(item.unitPriceSnapshot * 100) * item.quantity,
        0,
      ),
    ).toBe(Math.round(returnRecord.refundAmount * 100));
    expect((await orderSnapshot(result.orderId)).order.totalAmount).toBe(
      58.33,
    );
    expect(await stockOf(fixture)).toMatchObject({ medium: 5, stickers: 9 });
  });

  it("rejects duplicate or fractional bundle entries in a customer edit", async () => {
    const fixture = await createFixture();
    const result = await buy(
      fixture,
      [],
      [bundleRequest(fixture, { quantity: 2 })],
    );
    signIn(fixture);
    const order = (await fetchOrder(result.orderId))!;
    const orderBundleId = order.bundles![0].id;
    const edit = (bundles: { orderBundleId: number; quantity: number }[]) =>
      updateOrder(
        result.orderId,
        fixture.userId,
        [],
        order.updatedAt.toISOString(),
        bundles,
      );

    // Each entry asks to keep one bundle; together they must not remove both.
    expect(
      await edit([
        { orderBundleId, quantity: 1 },
        { orderBundleId, quantity: 1 },
      ]),
    ).toMatchObject({ success: false, cause: "forbidden" });
    expect(await edit([{ orderBundleId, quantity: 0.5 }])).toMatchObject({
      success: false,
      cause: "forbidden",
    });
    expect(
      await edit([{ orderBundleId: orderBundleId + 0.5, quantity: 1 }]),
    ).toMatchObject({ success: false, cause: "forbidden" });

    expect((await orderSnapshot(result.orderId)).order).toMatchObject({
      status: "pending",
      totalAmount: 300,
      revision: 1,
    });
    expect(await stockOf(fixture)).toMatchObject({
      medium: 3,
      tote: 3,
      stickers: 6,
    });
  });

  /** The fixture bundle as the editor submits it, with its component ids. */
  async function fixtureInput(
    fixture: Fixture,
    overrides: Record<string, unknown> = {},
  ) {
    const components = await db()
      .select()
      .from(merchBundleComponents)
      .where(eq(merchBundleComponents.bundleId, fixture.bundleId))
      .orderBy(merchBundleComponents.sortOrder);
    return {
      id: fixture.bundleId,
      revision: await revisionOf(fixture.bundleId),
      name: "Kit fixture",
      slug: `kit-fixture-${fixture.bundleId}`,
      description: "",
      imageUrl: "",
      price: 150,
      isVisible: true,
      sortOrder: 1,
      collectionIds: [],
      components: components.map((component) => ({
        id: component.id,
        productId: component.productId,
        quantity: component.quantity,
        variantIds:
          component.id === fixture.shirtComponentId
            ? [fixture.shirtSmallId, fixture.shirtMediumId]
            : [],
      })),
      ...overrides,
    };
  }

  it("keeps a published bundle editable after its variant prices diverge", async () => {
    const fixture = await createFixture();
    signIn(fixture, "admin");
    // M goes up after publishing; every combination is still discounted.
    await db()
      .update(productVariants)
      .set({ price: 110 })
      .where(eq(productVariants.id, fixture.shirtMediumId));

    expect(
      await saveMerchBundle(
        await fixtureInput(fixture, { name: "Kit renombrado" }),
      ),
    ).toMatchObject({ success: true });
    expect(await bundleRow(fixture.bundleId)).toMatchObject({
      name: "Kit renombrado",
      isVisible: true,
      version: 1,
    });

    // Changing the shirt itself applies the same-price rule again...
    const input = await fixtureInput(fixture);
    expect(
      await saveMerchBundle({
        ...input,
        components: input.components.map((component) =>
          component.id === fixture.shirtComponentId
            ? { ...component, quantity: 2 }
            : component,
        ),
      }),
    ).toMatchObject({
      success: false,
      message: expect.stringContaining("mismo precio"),
    });
    // ...and so does publishing it again once it is a draft.
    expect(
      (await saveMerchBundle(await fixtureInput(fixture, { isVisible: false })))
        .success,
    ).toBe(true);
    expect(await saveMerchBundle(await fixtureInput(fixture))).toMatchObject({
      success: false,
      message: expect.stringContaining("mismo precio"),
    });
  });

  it("rejects a save from an editor that loaded an older copy", async () => {
    const fixture = await createFixture();
    signIn(fixture, "admin");
    const { fetchBundleEditorData } = await import("@/app/lib/merch/bundles");
    // The fixture's updated_at comes from the database clock, in
    // microseconds: the token must survive the round trip exactly.
    const loaded = await fetchBundleEditorData(fixture.bundleId);
    const input = await fixtureInput(fixture, {
      revision: loaded.revision ?? undefined,
    });
    expect((await saveMerchBundle({ ...input, price: 140 })).success).toBe(
      true,
    );

    // A second tab opened before that save only edits the description.
    expect(
      await saveMerchBundle({ ...input, description: "Otra descripción" }),
    ).toMatchObject({
      success: false,
      message: expect.stringContaining("Otra persona guardó este combo"),
    });
    expect(await bundleRow(fixture.bundleId)).toMatchObject({
      price: 140,
      description: null,
      version: 2,
    });
    expect(
      (await saveMerchBundle({ ...input, revision: undefined })).success,
    ).toBe(false);

    const reloaded = await fetchBundleEditorData(fixture.bundleId);
    expect(
      (
        await saveMerchBundle({
          ...input,
          revision: reloaded.revision ?? undefined,
          price: 140,
          description: "Otra descripción",
        })
      ).success,
    ).toBe(true);
  });

  it("lists what blocks publishing a draft", async () => {
    const fixture = await createFixture();
    signIn(fixture, "admin");
    await db()
      .update(productVariants)
      .set({ price: 110 })
      .where(eq(productVariants.id, fixture.shirtMediumId));
    const { fetchBundleManagement } = await import("@/app/lib/merch/bundles");
    const row = async () =>
      (await fetchBundleManagement()).find(
        (bundle) => bundle.id === fixture.bundleId,
      )!;

    // Published, diverged variant prices are tolerated.
    expect((await row()).evaluation.issues).toEqual([]);
    await db()
      .update(merchBundles)
      .set({ isVisible: false })
      .where(eq(merchBundles.id, fixture.bundleId));
    expect((await row()).evaluation.issues.map((issue) => issue.code)).toEqual([
      "variant_price_mismatch",
    ]);
  });

  it("removes a deleted bundle from carts and keeps it in past orders", async () => {
    const fixture = await createFixture();
    const order = await buy(fixture, [], [bundleRequest(fixture)]);
    signIn(fixture);
    expect(
      await cartActions.addBundleToCart(bundleRequest(fixture)),
    ).toMatchObject({ success: true });

    signIn(fixture, "admin");
    const { deleteMerchBundle } =
      await import("@/app/lib/merch/bundle-actions");
    expect(await deleteMerchBundle(fixture.bundleId)).toEqual({
      success: true,
      message: "Combo eliminado.",
    });
    expect(await deleteMerchBundle(fixture.bundleId)).toMatchObject({
      success: false,
      message: "El combo ya no existe.",
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
    const snapshot = await orderSnapshot(order.orderId);
    expect(snapshot.order.totalAmount).toBe(150);
    expect(snapshot.bundles).toEqual([
      expect.objectContaining({
        bundleId: null,
        nameSnapshot: expect.stringContaining("Kit"),
        unitPriceCents: 15000,
        totalCents: 15000,
      }),
    ]);
    expect(snapshot.items).toHaveLength(3);
    expect(snapshot.items.every((row) => row.allocation != null)).toBe(true);
  });

  it("deletes a bundle without deadlocking a checkout that holds its cart line", async () => {
    const fixture = await createFixture();
    signIn(fixture);
    expect(
      await cartActions.addBundleToCart(bundleRequest(fixture)),
    ).toMatchObject({ success: true });
    signIn(fixture, "admin");
    const { deleteMerchBundle } =
      await import("@/app/lib/merch/bundle-actions");

    const checkout = await pool!.connect();
    try {
      await checkout.query("BEGIN");
      const {
        rows: [{ pid }],
      } = await checkout.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );
      // In checkoutCart's order: the cart's bundle lines first...
      await checkout.query(
        "SELECT id FROM cart_bundles WHERE bundle_id = $1 FOR UPDATE",
        [fixture.bundleId],
      );
      const deleting = deleteMerchBundle(fixture.bundleId);
      for (let attempt = 0; ; attempt += 1) {
        const { rows } = await pool!.query<{ waiting: number }>(
          "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
          [pid],
        );
        if (rows[0].waiting > 0) break;
        if (attempt > 250) throw new Error("The delete never waited.");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      // ...then the bundle, before clearing the cart.
      await checkout.query(
        "SELECT id FROM merch_bundles WHERE id = $1 FOR SHARE",
        [fixture.bundleId],
      );
      await checkout.query("DELETE FROM cart_bundles WHERE bundle_id = $1", [
        fixture.bundleId,
      ]);
      await checkout.query("COMMIT");
      expect(await deleting).toEqual({
        success: true,
        message: "Combo eliminado.",
      });
    } catch (error) {
      await checkout.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      checkout.release();
    }
  });

  it("refuses to delete products sold inside a bundle once they leave it", async () => {
    const fixture = await createFixture();
    const order = await buy(fixture, [], [bundleRequest(fixture)]);
    // The tote leaves the bundle: only the past order still uses it.
    await db()
      .delete(merchBundleComponents)
      .where(eq(merchBundleComponents.productId, fixture.toteId));
    signIn(fixture, "admin");
    const { bulkDeleteProducts } = await import("@/app/lib/products/actions");

    const refusal = {
      success: false,
      message: expect.stringContaining("se vendió dentro de un combo"),
    };
    expect(await deleteProduct(fixture.toteId)).toMatchObject(refusal);
    expect(await bulkDeleteProducts([fixture.toteId])).toMatchObject(refusal);
    const snapshot = await orderSnapshot(order.orderId);
    expect(
      snapshot.items.filter((row) => row.item.productId === fixture.toteId),
    ).toHaveLength(1);
    expect(
      await db()
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, fixture.toteId)),
    ).toHaveLength(1);
  });

  /** The admin narrows the shirt to size M: same component, new version. */
  async function narrowShirtToMedium(fixture: Fixture, version: number) {
    await db()
      .delete(merchBundleComponentVariants)
      .where(eq(merchBundleComponentVariants.variantId, fixture.shirtSmallId));
    await db()
      .update(merchBundles)
      .set({ version })
      .where(eq(merchBundles.id, fixture.bundleId));
  }

  async function cartBundleRows(fixture: Fixture) {
    const [userCart] = await db()
      .select()
      .from(carts)
      .where(eq(carts.userId, fixture.userId));
    return db()
      .select()
      .from(cartBundles)
      .where(eq(cartBundles.cartId, userCart.id))
      .orderBy(cartBundles.id);
  }

  it("keeps one cart line per configuration after a choice becomes fixed", async () => {
    const fixture = await createFixture();
    signIn(fixture);
    const add = (overrides: Partial<ReturnType<typeof bundleRequest>> = {}) =>
      cartActions.addBundleToCart({ ...bundleRequest(fixture), ...overrides });
    expect(await add()).toMatchObject({ success: true, newCount: 1 });

    await narrowShirtToMedium(fixture, 2);
    // Adding more never confirms the new price for the units already there.
    expect(await add({ bundleVersion: 2, selections: [] })).toMatchObject({
      success: false,
      message: expect.stringContaining("Confirmá su precio actual"),
    });
    const [row] = await cartBundleRows(fixture);
    expect(row).toMatchObject({
      bundleVersion: 1,
      quantity: 1,
      selectionKey: `${fixture.shirtComponentId}:${fixture.shirtMediumId}`,
    });

    // The customer confirms version 2, but the admin saved version 3 since.
    await db()
      .update(merchBundles)
      .set({ version: 3 })
      .where(eq(merchBundles.id, fixture.bundleId));
    expect(await cartActions.acceptCartBundleChanges(row.id, 2)).toMatchObject({
      success: false,
      error: expect.stringContaining("volvió a cambiar"),
    });
    expect((await cartBundleRows(fixture))[0].bundleVersion).toBe(1);

    expect(await cartActions.acceptCartBundleChanges(row.id, 3)).toMatchObject({
      success: true,
    });
    expect(await cartBundleRows(fixture)).toEqual([
      expect.objectContaining({
        id: row.id,
        bundleVersion: 3,
        selectionKey: "-",
      }),
    ]);
    expect(
      await db()
        .select()
        .from(schema.cartBundleSelections)
        .where(eq(schema.cartBundleSelections.cartBundleId, row.id)),
    ).toEqual([]);

    // The page sends no choice for a fixed component and a crafted request
    // sends one: both name the same line.
    expect(await add({ bundleVersion: 3, selections: [] })).toMatchObject({
      success: true,
      newCount: 2,
    });
    expect(await add({ bundleVersion: 3 })).toMatchObject({
      success: true,
      newCount: 3,
    });
    expect(await cartBundleRows(fixture)).toEqual([
      expect.objectContaining({ id: row.id, quantity: 3, selectionKey: "-" }),
    ]);
  });

  it("merges a confirmed line into the current line with the same configuration", async () => {
    const fixture = await createFixture();
    signIn(fixture);
    await cartActions.addBundleToCart(bundleRequest(fixture, { quantity: 2 }));
    await narrowShirtToMedium(fixture, 2);
    const [stale] = await cartBundleRows(fixture);
    const [userCart] = await db()
      .select()
      .from(carts)
      .where(eq(carts.userId, fixture.userId));
    await db().insert(cartBundles).values({
      cartId: userCart.id,
      bundleId: fixture.bundleId,
      bundleVersion: 2,
      selectionKey: "-",
      quantity: 4,
    });

    expect(
      await cartActions.acceptCartBundleChanges(stale.id, 2),
    ).toMatchObject({ success: true, message: expect.stringContaining("5") });
    expect(await cartBundleRows(fixture)).toEqual([
      expect.objectContaining({
        id: stale.id,
        bundleVersion: 2,
        quantity: 5,
        selectionKey: "-",
      }),
    ]);
  });

  it("reserves no stock for bundle lines that cannot be checked out", async () => {
    const fixture = await createFixture({ tote: 2 });
    signIn(fixture);
    const tote = {
      productId: fixture.toteId,
      productVariantId: null,
      quantity: 1,
    };
    await cartActions.addBundleToCart(bundleRequest(fixture, { quantity: 2 }));
    expect(await cartActions.addToCart(tote)).toMatchObject({ success: false });

    await db()
      .update(products)
      .set({ isVisible: false })
      .where(eq(products.id, fixture.shirtId));
    expect(await cartActions.addToCart(tote)).toMatchObject({ success: true });
    const cart = await cartActions.fetchCartWithItems();
    expect(cart.data?.bundles).toEqual([
      expect.objectContaining({ issue: "unavailable", components: [] }),
    ]);
    expect(
      await cartActions.updateCartItemQuantity(cart.data!.items[0].id, 2),
    ).toEqual({ success: true });

    const [check] = await cartActions.validateGuestCartStock(
      [{ lineKey: "tote", ...tote, quantity: 2 }],
      [{ lineKey: "kit", ...bundleRequest(fixture, { quantity: 2 }) }],
    );
    expect(check).toMatchObject({ stock: 2, quantityExceedsStock: false });
  });

  it("never shows an unpublished bundle's draft in a signed-in cart", async () => {
    const fixture = await createFixture();
    signIn(fixture);
    await cartActions.addBundleToCart(bundleRequest(fixture));
    await db()
      .update(merchBundles)
      .set({ isVisible: false, name: "Kit Navidad", price: 120 })
      .where(eq(merchBundles.id, fixture.bundleId));

    const cart = await cartActions.fetchCartWithItems();
    expect(cart.data?.bundles).toEqual([
      expect.objectContaining({
        name: "Combo no disponible",
        unitPriceCents: 0,
        components: [],
        issue: "unavailable",
      }),
    ]);
    expect(
      await cartActions.removeCartBundle(cart.data!.bundles[0].cartBundleId!),
    ).toEqual({ success: true });
  });

  it("resolves guest lines one by one and drops deleted bundles", async () => {
    const fixture = await createFixture({ tote: 3 });
    const [gone] = await db()
      .insert(merchBundles)
      .values({
        name: `Borrado ${fixture.userId}`,
        slug: `borrado-${fixture.userId}`,
        price: 10,
        isVisible: true,
      })
      .returning();
    await db().delete(merchBundles).where(eq(merchBundles.id, gone.id));

    const resolution = await cartActions.resolveGuestCart(
      [
        { lineKey: "kit", ...bundleRequest(fixture, { quantity: 2 }) },
        {
          lineKey: "gone",
          bundleId: gone.id,
          bundleVersion: 1,
          quantity: 1,
          selections: [],
        },
        // Tampered: above the per-line cap.
        { lineKey: "broken", ...bundleRequest(fixture, { quantity: 9 }) },
      ],
      [
        {
          lineKey: "tote",
          productId: fixture.toteId,
          productVariantId: null,
          quantity: 2,
        },
      ],
    );
    expect(resolution.removedBundleKeys).toEqual(["gone"]);
    expect(resolution.bundles).toEqual([
      // Two totes for the individual line leave one for the bundles...
      expect.objectContaining({
        key: "kit",
        issue: "stock_insufficient",
        maxQuantity: 1,
      }),
      expect.objectContaining({
        key: "broken",
        issue: "unavailable",
        name: "Combo no disponible",
      }),
    ]);
    // ...and the two bundles leave one for the individual line.
    expect(resolution.items).toEqual([
      expect.objectContaining({
        lineKey: "tote",
        stock: 1,
        quantityExceedsStock: true,
      }),
    ]);

    const capped = await cartActions.resolveGuestCart(
      Array.from({ length: 21 }, (_, index) => ({
        lineKey: `line-${index}`,
        ...bundleRequest(fixture),
      })),
      [],
    );
    expect(capped.bundles).toHaveLength(21);
    expect(
      capped.bundles.filter((line) => line.message?.includes("hasta 20")),
    ).toEqual([expect.objectContaining({ key: "line-20" })]);
  });

  it("plans guest adds with the signed-in rules", async () => {
    const fixture = await createFixture({ tote: 3 });
    const first = await cartActions.planGuestBundleAdd(
      bundleRequest(fixture, { quantity: 2 }),
      [],
      [],
    );
    if (!first.success) throw new Error(first.message);
    expect(first).toMatchObject({ added: 2, replaces: [] });
    expect(first.bundle).toMatchObject({
      lineKey: `bundle:${fixture.bundleId}:${fixture.shirtComponentId}:${fixture.shirtMediumId}`,
      bundleVersion: 1,
      quantity: 2,
      unitPriceCents: 15000,
    });
    const line = {
      lineKey: first.bundle.lineKey,
      bundleId: fixture.bundleId,
      bundleVersion: 1,
      quantity: 2,
      selections: first.bundle.selections,
    };

    expect(
      await cartActions.planGuestBundleAdd(
        bundleRequest(fixture, { quantity: 2 }),
        [line],
        [],
      ),
    ).toMatchObject({
      success: true,
      added: 1,
      replaces: [line.lineKey],
      bundle: { quantity: 3 },
      message: "Agregamos 1 por el stock disponible.",
    });
    const full = { ...line, quantity: 3 };
    expect(
      await cartActions.planGuestBundleAdd(bundleRequest(fixture), [full], []),
    ).toMatchObject({
      success: false,
      message: "No hay más stock disponible para este combo.",
    });

    const otherLines = Array.from({ length: 20 }, (_, index) => ({
      lineKey: `other-${index}`,
      bundleId: 2_000_000_000 + index,
      bundleVersion: 1,
      quantity: 1,
      selections: [],
    }));
    expect(
      await cartActions.planGuestBundleAdd(
        bundleRequest(fixture, { variantId: fixture.shirtSmallId }),
        otherLines,
        [],
      ),
    ).toMatchObject({
      success: false,
      message: expect.stringContaining("hasta 20 combos"),
    });

    await narrowShirtToMedium(fixture, 2);
    expect(
      await cartActions.planGuestBundleAdd(
        { ...bundleRequest(fixture, { bundleVersion: 2 }), selections: [] },
        [full],
        [],
      ),
    ).toMatchObject({
      success: false,
      message: expect.stringContaining("Confirmá su precio actual"),
    });
  });
  it("says the per-line cap, not stock, held back a guest add", async () => {
    const fixture = await createFixture({ medium: 20, tote: 20, stickers: 40 });
    const first = await cartActions.planGuestBundleAdd(
      bundleRequest(fixture, { quantity: 1 }),
      [],
      [],
    );
    if (!first.success) throw new Error(first.message);
    const line = {
      lineKey: first.bundle.lineKey,
      bundleId: fixture.bundleId,
      bundleVersion: 1,
      quantity: 1,
      selections: first.bundle.selections,
    };
    expect(
      await cartActions.planGuestBundleAdd(
        bundleRequest(fixture, { quantity: 5 }),
        [line],
        [],
      ),
    ).toMatchObject({
      success: true,
      added: 4,
      bundle: { quantity: 5 },
      message: "Agregamos 4: podés llevar hasta 5 unidades de este combo.",
    });
  });

  /** Waits until another session is blocked by the one with this pid. */
  async function waitUntilBlockedBy(pid: number) {
    for (let attempt = 0; ; attempt += 1) {
      const { rows } = await pool!.query<{ waiting: number }>(
        "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
        [pid],
      );
      if (rows[0].waiting > 0) return;
      if (attempt > 250) throw new Error("Nothing ever waited.");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  it("rewrites a cart line's choices without deadlocking an admin save", async () => {
    const fixture = await createFixture();
    signIn(fixture);
    expect(
      await cartActions.addBundleToCart(bundleRequest(fixture)),
    ).toMatchObject({ success: true });

    const admin = await pool!.connect();
    try {
      await admin.query("BEGIN");
      const {
        rows: [{ pid }],
      } = await admin.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      // saveMerchBundle locks the bundle, then deletes a component the
      // customer chose. Locking the component first holds the save at the
      // moment its delete reaches it.
      await admin.query(
        "SELECT id FROM merch_bundles WHERE id = $1 FOR UPDATE",
        [fixture.bundleId],
      );
      await admin.query(
        "SELECT id FROM merch_bundle_components WHERE id = $1 FOR UPDATE",
        [fixture.shirtComponentId],
      );
      // Merges into the stored line, rewriting its choices.
      const adding = cartActions.addBundleToCart(bundleRequest(fixture));
      await waitUntilBlockedBy(pid);
      await admin.query("DELETE FROM merch_bundle_components WHERE id = $1", [
        fixture.shirtComponentId,
      ]);
      await admin.query("UPDATE merch_bundles SET version = 2 WHERE id = $1", [
        fixture.bundleId,
      ]);
      await admin.query("COMMIT");
      // The add waited for the save, then saw the combo it planned is gone.
      expect(await adding).toMatchObject({
        success: false,
        message:
          "El combo cambió. Recargá la página para ver su precio y contenido actualizados.",
      });
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }
    expect(await cartBundleRows(fixture)).toEqual([
      expect.objectContaining({ bundleVersion: 1, quantity: 1 }),
    ]);
  });

  it("merges duplicate cart lines without deadlocking a bundle delete", async () => {
    const fixture = await createFixture();
    signIn(fixture);
    await cartActions.addBundleToCart(bundleRequest(fixture));
    // The size became fixed, and both lines were saved at the new version:
    // one while the size was still a choice, one after.
    await narrowShirtToMedium(fixture, 2);
    const [chosen] = await cartBundleRows(fixture);
    await db()
      .update(cartBundles)
      .set({ bundleVersion: 2 })
      .where(eq(cartBundles.id, chosen.id));
    await db().insert(cartBundles).values({
      cartId: chosen.cartId,
      bundleId: fixture.bundleId,
      bundleVersion: 2,
      selectionKey: "-",
      quantity: 1,
    });
    const [first, second] = await cartBundleRows(fixture);

    const deleting = await pool!.connect();
    try {
      await deleting.query("BEGIN");
      const {
        rows: [{ pid }],
      } = await deleting.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );
      // deleteMerchBundle locks the bundle's cart lines by id: hold it
      // between the first line and the second.
      await deleting.query(
        "SELECT id FROM cart_bundles WHERE id = $1 FOR UPDATE",
        [first.id],
      );
      const adding = cartActions.addBundleToCart({
        ...bundleRequest(fixture, { bundleVersion: 2 }),
        selections: [],
      });
      await waitUntilBlockedBy(pid);
      await deleting.query(
        "SELECT id FROM cart_bundles WHERE id = $1 FOR UPDATE",
        [second.id],
      );
      await deleting.query(
        "SELECT id FROM merch_bundles WHERE id = $1 FOR UPDATE",
        [fixture.bundleId],
      );
      await deleting.query("DELETE FROM merch_bundles WHERE id = $1", [
        fixture.bundleId,
      ]);
      await deleting.query("COMMIT");
      expect(await adding).toMatchObject({
        success: false,
        message: "Este combo ya no está disponible.",
      });
    } catch (error) {
      await deleting.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      deleting.release();
    }
    expect(await cartBundleRows(fixture)).toEqual([]);
  });

  it("refuses to write a cart merge planned on lines that changed since", async () => {
    const fixture = await createFixture();
    signIn(fixture);
    await cartActions.addBundleToCart(bundleRequest(fixture));
    const [line] = await cartBundleRows(fixture);

    const other = await pool!.connect();
    try {
      await other.query("BEGIN");
      const {
        rows: [{ pid }],
      } = await other.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      // Another request is removing the line the add will plan on.
      await other.query(
        "SELECT id FROM cart_bundles WHERE id = $1 FOR UPDATE",
        [line.id],
      );
      const adding = cartActions.addBundleToCart(bundleRequest(fixture));
      await waitUntilBlockedBy(pid);
      await other.query("DELETE FROM cart_bundles WHERE id = $1", [line.id]);
      await other.query("COMMIT");
      expect(await adding).toMatchObject({
        success: false,
        message:
          "Tu carrito cambió mientras agregábamos el combo. Intentá de nuevo.",
      });
    } catch (error) {
      await other.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      other.release();
    }
    expect(await cartBundleRows(fixture)).toEqual([]);
  });

  it("refuses to add a bundle unpublished between the plan and the write", async () => {
    const fixture = await createFixture();
    signIn(fixture);

    const admin = await pool!.connect();
    try {
      await admin.query("BEGIN");
      const {
        rows: [{ pid }],
      } = await admin.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      await admin.query(
        "SELECT id FROM merch_bundles WHERE id = $1 FOR UPDATE",
        [fixture.bundleId],
      );
      // The add plans on the published bundle, then waits for its lock.
      const adding = cartActions.addBundleToCart(bundleRequest(fixture));
      await waitUntilBlockedBy(pid);
      // Unpublishing keeps the version.
      await admin.query(
        "UPDATE merch_bundles SET is_visible = false WHERE id = $1",
        [fixture.bundleId],
      );
      await admin.query("COMMIT");
      expect(await adding).toMatchObject({
        success: false,
        message: "Este combo ya no está disponible.",
      });
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }
    expect(await cartBundleRows(fixture)).toEqual([]);
  });

  it("refuses to confirm a bundle's changes once the bundle or the cart moved on", async () => {
    const fixture = await createFixture();
    signIn(fixture);
    await cartActions.addBundleToCart(bundleRequest(fixture));
    await narrowShirtToMedium(fixture, 2);
    const [line] = await cartBundleRows(fixture);

    /**
     * Holds `lockSql`'s row while the confirmation of version 2 waits on it,
     * applies `changeSql`, and returns the confirmation's answer.
     */
    async function acceptWhile(lockSql: string, changeSql: string) {
      const other = await pool!.connect();
      try {
        await other.query("BEGIN");
        const {
          rows: [{ pid }],
        } = await other.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        );
        await other.query(lockSql);
        const accepting = cartActions.acceptCartBundleChanges(line.id, 2);
        await waitUntilBlockedBy(pid);
        await other.query(changeSql);
        await other.query("COMMIT");
        return await accepting;
      } catch (error) {
        await other.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        other.release();
      }
    }

    // The admin saves version 3 while the confirmation waits for the bundle.
    expect(
      await acceptWhile(
        `SELECT id FROM merch_bundles WHERE id = ${fixture.bundleId} FOR UPDATE`,
        `UPDATE merch_bundles SET version = 3 WHERE id = ${fixture.bundleId}`,
      ),
    ).toEqual({
      success: false,
      error: "El combo volvió a cambiar. Revisá el nuevo precio.",
    });
    expect(await cartBundleRows(fixture)).toEqual([
      expect.objectContaining({ id: line.id, bundleVersion: 1, quantity: 1 }),
    ]);

    // Back at version 2, another request changes the line's quantity while
    // the confirmation waits for the cart's lines.
    await db()
      .update(merchBundles)
      .set({ version: 2 })
      .where(eq(merchBundles.id, fixture.bundleId));
    expect(
      await acceptWhile(
        `SELECT id FROM cart_bundles WHERE id = ${line.id} FOR UPDATE`,
        `UPDATE cart_bundles SET quantity = 2 WHERE id = ${line.id}`,
      ),
    ).toEqual({
      success: false,
      error:
        "Tu carrito cambió mientras actualizábamos el combo. Intentá de nuevo.",
    });
    expect(await cartBundleRows(fixture)).toEqual([
      expect.objectContaining({ id: line.id, bundleVersion: 1, quantity: 2 }),
    ]);
  });
});
