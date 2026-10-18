// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => vi.fn());
// Any database access fails the test unless a case installs exactly the
// queries it expects: a refused caller must be turned away before the first.
const dbState = vi.hoisted(() => ({
  touched: 0,
  impl: null as Record<PropertyKey, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/lib/posthog-server", () => ({
  captureServerEvent: vi.fn(),
  getPostHogClient: vi.fn(),
  POSTHOG_SHUTDOWN_TIMEOUT_MS: 0,
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: profileMock,
  getCurrentBaseProfile: profileMock,
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        dbState.touched += 1;
        if (dbState.impl && prop in dbState.impl) return dbState.impl[prop];
        throw new Error(`database touched: ${String(prop)}`);
      },
    },
  ),
}));

import * as cartActions from "@/app/lib/cart/actions";
import * as bannerActions from "@/app/lib/marketing_banners/actions";
import * as orderActions from "@/app/lib/orders/actions";
import {
  fetchOrder,
  fetchOrderCountsByUserId,
  fetchOrdersByUserIdAndStatus,
  fetchPendingVoucherCount,
  fetchPendingVoucherReviewOrders,
  updateOrder,
} from "@/app/lib/orders/actions";
import { checkSlugAvailability } from "@/app/lib/posts/actions";
import * as productActions from "@/app/lib/products/actions";
import {
  fetchFeaturedProducts,
  fetchProductBySlug,
  fetchProducts,
} from "@/app/lib/products/queries";
import { fetchQrCode, fetchQrCodes } from "@/app/lib/qr_codes/actions";
import * as contentSectionActions from "@/app/lib/rentals/content-section-actions";

const SIGNED_OUT = null;
const PARTICIPANT = { id: 5, role: "user", status: "verified" };
const FESTIVAL_ADMIN = { id: 2, role: "festival_admin", status: "verified" };
const ADMIN = { id: 1, role: "admin", status: "verified" };
const ORDER_OWNER_ID = 9;

function signIn(profile: object | null) {
  profileMock.mockResolvedValue(profile);
}

beforeEach(() => {
  profileMock.mockReset();
  dbState.touched = 0;
  dbState.impl = null;
});

describe("use-server modules expose only guarded actions", () => {
  it("keeps order creation, emails and dead reads out of orders/actions", () => {
    for (const name of [
      "createOrder",
      "createOrderInTx",
      "createGuestOrderInTx",
      "sendOrderEmails",
      "sendGuestOrderEmails",
      "fetchOrdersByUserId",
    ]) {
      expect(orderActions).not.toHaveProperty(name);
    }
  });

  it("keeps the checkout transaction helpers out of cart/actions", () => {
    expect(cartActions).not.toHaveProperty("clearCartInTx");
    expect(cartActions).not.toHaveProperty("fetchCartWithItemsForCheckout");
  });

  it("keeps the product reads out of products/actions", () => {
    for (const name of [
      "fetchProducts",
      "fetchProduct",
      "fetchProductBySlug",
      "fetchFeaturedProducts",
    ]) {
      expect(productActions).not.toHaveProperty(name);
    }
  });

  it("keeps the section read and snapshot helper out of content-section-actions", () => {
    expect(contentSectionActions).not.toHaveProperty(
      "fetchProductContentSections",
    );
    expect(contentSectionActions).not.toHaveProperty(
      "buildRentalContentSectionsSnapshot",
    );
  });

  it("keeps the public banner reads out of marketing_banners/actions", () => {
    expect(bannerActions).not.toHaveProperty("fetchMarketingBannersForLanding");
    expect(bannerActions).not.toHaveProperty("fetchMarketingBannersForPortal");
  });

  it.each([
    "app/lib/orders/create-order.ts",
    "app/lib/orders/order-emails.ts",
    "app/lib/orders/scheduled-actions.ts",
    "app/lib/products/queries.ts",
    "app/lib/products/scheduled-actions.ts",
    "app/lib/rentals/eligibility.ts",
    "app/lib/marketing_banners/queries.ts",
  ])("%s is server-only, not a server action module", (file) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/^\s*["']use server["']/m);
  });
});

describe.each([
  ["a signed-out visitor", SIGNED_OUT],
  ["a participant", PARTICIPANT],
])("commerce reads called by %s", (_, profile) => {
  beforeEach(() => signIn(profile));

  it("get no other customer's order list or counts", async () => {
    expect(
      await fetchOrdersByUserIdAndStatus(ORDER_OWNER_ID, "pending"),
    ).toEqual([]);
    expect(
      Object.values(await fetchOrderCountsByUserId(ORDER_OWNER_ID)),
    ).toSatisfy((counts: number[]) => counts.every((value) => value === 0));
    expect(dbState.touched).toBe(0);
  });

  it("get no payment review queue", async () => {
    expect(await fetchPendingVoucherReviewOrders()).toEqual([]);
    expect(await fetchPendingVoucherCount()).toBe(0);
    expect(dbState.touched).toBe(0);
  });
});

describe.each([
  ["a signed-out visitor", SIGNED_OUT],
  ["a participant", PARTICIPANT],
  ["a festival admin", FESTIVAL_ADMIN],
])("QR code admin reads called by %s", (_, profile) => {
  it("are refused before any query", async () => {
    signIn(profile);

    expect(await fetchQrCodes()).toEqual([]);
    expect(await fetchQrCode(1)).toEqual({ found: false });
    expect(dbState.touched).toBe(0);
  });
});

describe("fetchOrder", () => {
  const order = { id: 1, userId: ORDER_OWNER_ID, orderItems: [] };
  let ownerRows: { userId: number | null }[];
  let findFirst: ReturnType<typeof vi.fn>;

  function installOrder() {
    ownerRows = [{ userId: ORDER_OWNER_ID }];
    findFirst = vi.fn().mockResolvedValue(order);
    dbState.impl = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => ownerRows }) }),
      }),
      query: {
        orders: { findFirst },
        orderAdjustments: { findMany: vi.fn().mockResolvedValue([]) },
      },
    };
  }

  it("refuses a signed-out visitor before any query", async () => {
    signIn(SIGNED_OUT);

    expect(await fetchOrder(1)).toBeNull();
    expect(dbState.touched).toBe(0);
  });

  it("hides another customer's order without loading it", async () => {
    signIn(PARTICIPANT);
    installOrder();

    expect(await fetchOrder(1)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("does not load a missing order for a participant", async () => {
    signIn(PARTICIPANT);
    installOrder();
    ownerRows = [];

    expect(await fetchOrder(1)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["its owner", { id: ORDER_OWNER_ID, role: "user" }],
    ["a festival admin", FESTIVAL_ADMIN],
    ["an admin", ADMIN],
  ])("returns the order to %s", async (_, profile) => {
    signIn(profile);
    installOrder();

    expect(await fetchOrder(1)).toMatchObject({ id: 1 });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("staff review queue", () => {
  it.each([
    ["a festival admin", FESTIVAL_ADMIN],
    ["an admin", ADMIN],
  ])("still counts pending vouchers for %s", async (_, profile) => {
    signIn(profile);
    dbState.impl = {
      select: () => ({ from: () => ({ where: async () => [{ count: 3 }] }) }),
    };

    expect(await fetchPendingVoucherCount()).toBe(3);
  });

  it("loads only the customer fields the queue renders", async () => {
    signIn(FESTIVAL_ADMIN);
    const findMany = vi.fn().mockResolvedValue([]);
    dbState.impl = { query: { orders: { findMany } } };

    expect(await fetchPendingVoucherReviewOrders()).toEqual([]);

    const query = findMany.mock.calls[0][0];
    expect(Object.keys(query.with.customer.columns).sort()).toEqual([
      "displayName",
      "email",
      "firstName",
      "id",
      "imageUrl",
      "lastName",
      "phoneNumber",
      "status",
    ]);
    expect(query.with.customer.with).toEqual({
      profileSubcategories: { with: { subcategory: true } },
    });
    expect(query.with).toHaveProperty("orderItems");
    expect(query.with).toHaveProperty("bundles");
  });
});

describe("updateOrder", () => {
  it("refuses a signed-out visitor before loading the order", async () => {
    signIn(SIGNED_OUT);

    const result = await updateOrder(
      1,
      ORDER_OWNER_ID,
      [{ orderItemId: 1, quantity: 1 }],
      new Date().toISOString(),
    );

    expect(result).toMatchObject({ success: false, cause: "forbidden" });
    expect(dbState.touched).toBe(0);
  });
});

describe("checkSlugAvailability", () => {
  it("refuses a signed-out visitor before any query", async () => {
    signIn(SIGNED_OUT);

    expect(await checkSlugAvailability(1, "Mi artículo")).toEqual({
      available: false,
      suggestion: "",
    });
    expect(dbState.touched).toBe(0);
  });

  it("does not probe slugs for a post the caller cannot edit", async () => {
    signIn(PARTICIPANT);
    // Only the post lookup is installed: probing the slug table would throw.
    dbState.impl = {
      query: {
        posts: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ authorId: ORDER_OWNER_ID, status: "draft" }),
        },
      },
    };

    expect(await checkSlugAvailability(1, "Mi artículo")).toEqual({
      available: false,
      suggestion: "",
    });
  });
});

describe("storefront product reads", () => {
  const product = {
    id: 1,
    unitCost: 7,
    lowStockThreshold: 5,
    stock: 3,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    variants: [{ id: 2, unitCost: 4, lowStockThreshold: 2, stock: 3 }],
  };
  let findMany: ReturnType<typeof vi.fn>;
  let findFirst: ReturnType<typeof vi.fn>;

  function installProducts() {
    findMany = vi.fn().mockResolvedValue([structuredClone(product)]);
    findFirst = vi.fn().mockResolvedValue(structuredClone(product));
    dbState.impl = { query: { products: { findMany, findFirst } } };
  }

  it("clear unit cost and low-stock threshold on the visible-only catalog", async () => {
    installProducts();

    const [listed] = await fetchProducts("updatedAt", { visibleOnly: true });
    const [featured] = await fetchFeaturedProducts();
    const bySlug = await fetchProductBySlug("producto", { visibleOnly: true });

    for (const row of [listed, featured, bySlug]) {
      expect(row).toMatchObject({
        unitCost: null,
        lowStockThreshold: null,
        variants: [{ unitCost: null, lowStockThreshold: null }],
      });
    }
  });

  it("load only visible content sections for the visible-only catalog", async () => {
    installProducts();

    await fetchProducts("updatedAt", { visibleOnly: true });
    await fetchFeaturedProducts();
    await fetchProductBySlug("producto", { visibleOnly: true });

    for (const call of [...findMany.mock.calls, ...findFirst.mock.calls]) {
      expect(call[0].with.contentSections.where).toBeDefined();
    }
  });

  it("keep the full admin row for the admin catalog", async () => {
    installProducts();

    const [listed] = await fetchProducts("updatedAt");

    expect(listed).toMatchObject({
      unitCost: 7,
      lowStockThreshold: 5,
      variants: [{ unitCost: 4, lowStockThreshold: 2 }],
    });
    expect(
      findMany.mock.calls[0][0].with.contentSections.where,
    ).toBeUndefined();
  });
});
