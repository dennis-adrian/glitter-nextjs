// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  orderEvents,
  orderItems,
  orders,
  products,
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

let createGuestOrderInTx: (typeof import("@/app/lib/orders/actions"))["createGuestOrderInTx"];
let createOrderInTx: (typeof import("@/app/lib/orders/actions"))["createOrderInTx"];

type OrderTx = Parameters<
  Parameters<NonNullable<typeof integrationDb>["transaction"]>[0]
>[0];

type Fixture = {
  userId: number;
  merchProductId: number;
  supplyProductId: number;
  orderIds: number[];
};

const fixtures: Fixture[] = [];

async function createFixture(): Promise<Fixture> {
  const db = integrationDb!;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `integration-order-actions-${suffix}`,
      email: `integration-order-actions-${suffix}@example.test`,
      displayName: "Integration Buyer",
      status: "verified",
    })
    .returning();
  const [merchProduct] = await db
    .insert(products)
    .values({
      name: `Merch ${suffix}`,
      slug: `integration-actions-merch-${suffix}`,
      price: 20,
      unitCost: 7,
      stock: 10,
      isPurchasable: true,
      storeCategory: "merch",
    })
    .returning();
  const [supplyProduct] = await db
    .insert(products)
    .values({
      name: `Supply ${suffix}`,
      slug: `integration-actions-supply-${suffix}`,
      price: 15,
      unitCost: 5,
      stock: 10,
      isPurchasable: true,
      storeCategory: "supplies",
    })
    .returning();

  const fixture: Fixture = {
    userId: user.id,
    merchProductId: merchProduct.id,
    supplyProductId: supplyProduct.id,
    orderIds: [],
  };
  fixtures.push(fixture);
  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  const db = integrationDb!;
  if (fixture.orderIds.length > 0) {
    await db
      .delete(orderEvents)
      .where(inArray(orderEvents.orderId, fixture.orderIds));
    await db
      .delete(orderItems)
      .where(inArray(orderItems.orderId, fixture.orderIds));
    await db.delete(orders).where(inArray(orders.id, fixture.orderIds));
  }
  await db
    .delete(products)
    .where(
      inArray(products.id, [fixture.merchProductId, fixture.supplyProductId]),
    );
  await db.delete(users).where(eq(users.id, fixture.userId));
}

describeDatabase("order creation category snapshots", () => {
  beforeAll(async () => {
    // Load application modules only after a dedicated, safely named test DB is
    // present. These values satisfy unrelated app-env validation in isolation.
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ createGuestOrderInTx, createOrderInTx } = await import(
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

  it("snapshots the purchased category on a registered order", async () => {
    const fixture = await createFixture();
    const result = await integrationDb!.transaction((tx) =>
      createOrderInTx(
        tx as OrderTx,
        [
          {
            productId: fixture.merchProductId,
            productVariantId: null,
            quantity: 1,
          },
          {
            productId: fixture.supplyProductId,
            productVariantId: null,
            quantity: 2,
          },
        ],
        fixture.userId,
        "integration@example.test",
        "Integration Buyer",
      ),
    );
    fixture.orderIds.push(result.orderId);

    const lines = await integrationDb!
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, result.orderId));

    expect(
      Object.fromEntries(
        lines.map((line) => [line.productId, line.storeCategoryAtPurchase]),
      ),
    ).toEqual({
      [fixture.merchProductId]: "merch",
      [fixture.supplyProductId]: "supplies",
    });
  });

  it("keeps snapshots after the product is reclassified", async () => {
    const fixture = await createFixture();
    const result = await integrationDb!.transaction((tx) =>
      createOrderInTx(
        tx as OrderTx,
        [
          {
            productId: fixture.supplyProductId,
            productVariantId: null,
            quantity: 1,
          },
        ],
        fixture.userId,
        "integration@example.test",
        "Integration Buyer",
      ),
    );
    fixture.orderIds.push(result.orderId);

    await integrationDb!
      .update(products)
      .set({ storeCategory: "merch" })
      .where(eq(products.id, fixture.supplyProductId));

    const [line] = await integrationDb!
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, result.orderId));

    expect(line.storeCategoryAtPurchase).toBe("supplies");
  });

  it("rejects guest supplies after locked-product resolution without writing", async () => {
    const fixture = await createFixture();
    const ordersBefore = await integrationDb!
      .select({ id: orders.id })
      .from(orders);

    await expect(
      integrationDb!.transaction((tx) =>
        createGuestOrderInTx(
          tx as OrderTx,
          [
            {
              productId: fixture.supplyProductId,
              productVariantId: null,
              quantity: 1,
            },
          ],
          "Invitada",
          "invitada@example.test",
          "+59171234567",
        ),
      ),
    ).rejects.toMatchObject({ cause: "supplies_unverified" });

    const ordersAfter = await integrationDb!
      .select({ id: orders.id })
      .from(orders);
    const [product] = await integrationDb!
      .select()
      .from(products)
      .where(eq(products.id, fixture.supplyProductId));

    expect(ordersAfter).toHaveLength(ordersBefore.length);
    expect(product.stock).toBe(10);
  });

  it("creates a guest merchandise order snapshotting merch", async () => {
    const fixture = await createFixture();
    const result = await integrationDb!.transaction((tx) =>
      createGuestOrderInTx(
        tx as OrderTx,
        [
          {
            productId: fixture.merchProductId,
            productVariantId: null,
            quantity: 1,
          },
        ],
        "Invitada",
        "invitada@example.test",
        "+59171234567",
      ),
    );
    fixture.orderIds.push(result.orderId);

    const [line] = await integrationDb!
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, result.orderId));

    expect(line.storeCategoryAtPurchase).toBe("merch");
  });
});
