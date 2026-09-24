import { describe, expect, it } from "vitest";

import type {
  GuestCartBundle,
  GuestCartItem,
} from "@/app/lib/cart/definitions";
import type {
  BundleSelectionInput,
  CartBundleLine,
} from "@/app/lib/merch/bundle-definitions";
import {
  buildBundleLineKey,
  bundleLineCapNotice,
  getBundleDemandLines,
  getGuestItemStockCap,
  guestBundleSignature,
  productLineCapNotice,
  reconcileGuestBundleLines,
  replaceGuestBundleLine,
  toGuestCartBundle,
} from "./utils";

const bundle = (
  selections: BundleSelectionInput[],
  overrides: Partial<GuestCartBundle> = {},
): GuestCartBundle => ({
  lineKey: buildBundleLineKey(4, selections),
  bundleId: 4,
  bundleVersion: 2,
  quantity: 1,
  selections,
  name: "Kit",
  slug: "kit",
  imageUrl: null,
  unitPriceCents: 15000,
  separateUnitPriceCents: 18000,
  components: [],
  ...overrides,
});

const shirtM = [{ componentId: 10, productVariantId: 102 }];

describe("replaceGuestBundleLine", () => {
  it("merges a re-keyed line into the one already holding its key, up to the cap", () => {
    const legacy = bundle(shirtM, { quantity: 4 });
    const current = bundle([], { quantity: 3 });
    const accepted = bundle([], { quantity: 4, name: "Kit nuevo" });
    expect(
      replaceGuestBundleLine([legacy, current], legacy.lineKey, accepted),
    ).toEqual({ bundles: [{ ...accepted, quantity: 5 }], droppedUnits: 2 });
  });

  it("keeps lines apart while the other one still awaits confirmation", () => {
    const legacy = bundle(shirtM, { bundleVersion: 1 });
    const stale = bundle([], { bundleVersion: 1 });
    const accepted = bundle([], { bundleVersion: 2 });
    const result = replaceGuestBundleLine(
      [legacy, stale],
      legacy.lineKey,
      accepted,
    );
    expect(result).toEqual({
      bundles: [
        { ...accepted, lineKey: legacy.lineKey, selections: shirtM },
        stale,
      ],
      droppedUnits: 0,
    });
  });
});

const resolved = (
  entry: GuestCartBundle,
  overrides: Partial<CartBundleLine> = {},
): CartBundleLine => ({
  key: entry.lineKey,
  cartBundleId: null,
  bundleId: entry.bundleId,
  bundleVersion: entry.bundleVersion,
  currentVersion: entry.bundleVersion,
  name: entry.name,
  slug: entry.slug,
  imageUrl: null,
  quantity: entry.quantity,
  selections: entry.selections,
  unitPriceCents: entry.unitPriceCents,
  separateUnitPriceCents: entry.separateUnitPriceCents,
  components: [],
  maxQuantity: 5,
  issue: null,
  message: null,
  ...overrides,
});

describe("reconcileGuestBundleLines", () => {
  it("reports the units a canonical merge leaves out", () => {
    const legacy = bundle(shirtM, { quantity: 4 });
    const current = bundle([], { quantity: 3 });
    expect(
      reconcileGuestBundleLines([legacy, current], {
        bundles: [resolved(legacy, { selections: [] }), resolved(current)],
        removedBundleKeys: [],
      }),
    ).toEqual({
      bundles: [
        { ...legacy, lineKey: current.lineKey, selections: [], quantity: 5 },
      ],
      droppedUnits: 2,
    });
  });

  it("returns the same lines when nothing changes", () => {
    const lines = [bundle([])];
    expect(
      reconcileGuestBundleLines(lines, {
        bundles: [resolved(lines[0])],
        removedBundleKeys: [],
      }).bundles,
    ).toBe(lines);
  });
});

const tote = (stock: number | null): GuestCartItem => ({
  lineKey: "7:base:purchase",
  productId: 7,
  productVariantId: null,
  productVariantLabel: null,
  quantity: 1,
  product: { id: 7, stock } as GuestCartItem["product"],
  variant: null,
});

const toteComponent = {
  productId: 7,
  productVariantId: null,
  productName: "Tote",
  variantLabel: null,
  quantity: 1,
  imageUrl: null,
};

describe("getGuestItemStockCap", () => {
  it("leaves an individual line what the guest's bundles do not take", () => {
    // Two bundles of one tote each, and one of a different product.
    const bundles = [
      bundle([], { quantity: 2, components: [toteComponent] }),
      bundle([], {
        quantity: 1,
        components: [{ ...toteComponent, productId: 8 }],
      }),
    ];
    expect(getGuestItemStockCap(tote(3), bundles)).toBe(1);
    expect(getGuestItemStockCap(tote(1), bundles)).toBe(0);
    expect(getGuestItemStockCap(tote(3), [])).toBe(3);
  });

  it("counts nothing for snapshots saved without component ids", () => {
    const legacy = bundle([], {
      quantity: 2,
      components: [
        {
          productName: "Tote",
          variantLabel: null,
          quantity: 1,
          imageUrl: null,
        },
      ] as GuestCartBundle["components"],
    });
    expect(getGuestItemStockCap(tote(3), [legacy])).toBe(3);
  });

  it("frees the stock of lines the server found unbuyable until they resolve again", () => {
    const kit = bundle([], { quantity: 1, components: [toteComponent] });
    expect(getGuestItemStockCap(tote(1), [kit])).toBe(0);

    for (const issue of ["unavailable", "selection_invalid"] as const) {
      const {
        bundles: [blocked],
      } = reconcileGuestBundleLines([kit], {
        bundles: [resolved(kit, { issue, message: "No disponible." })],
        removedBundleKeys: [],
      });
      expect(blocked).toEqual({ ...kit, blocked: true });
      // The server reserves nothing for it either.
      expect(getGuestItemStockCap(tote(1), [blocked])).toBe(1);

      // Resolved lines count again; a line awaiting confirmation still
      // reserves, as on the server.
      for (const next of [null, "stale"] as const) {
        const {
          bundles: [clean],
        } = reconcileGuestBundleLines([blocked], {
          bundles: [resolved(blocked, { issue: next })],
          removedBundleKeys: [],
        });
        expect(clean.blocked).toBeUndefined();
        expect(getGuestItemStockCap(tote(1), [clean])).toBe(0);
      }

      // A resolution that does not cover the line leaves it as it was.
      const untouched = [blocked];
      expect(
        reconcileGuestBundleLines(untouched, {
          bundles: [],
          removedBundleKeys: [],
        }).bundles,
      ).toBe(untouched);
    }
  });
});

describe("productLineCapNotice", () => {
  it("names the per-line cap, with the units that still went in", () => {
    expect(productLineCapNotice(0)).toBe(
      "Podés llevar hasta 5 unidades de este producto.",
    );
    expect(productLineCapNotice(1)).toBe(
      "Agregamos 1: podés llevar hasta 5 unidades de este producto.",
    );
  });
});

describe("bundleLineCapNotice", () => {
  it("names the per-line cap, with the units that still went in", () => {
    expect(bundleLineCapNotice(0)).toBe(
      "Podés llevar hasta 5 unidades de este combo.",
    );
    expect(bundleLineCapNotice(2)).toBe(
      "Agregamos 2: podés llevar hasta 5 unidades de este combo.",
    );
  });
});

describe("guestBundleSignature", () => {
  it("matches equal lines in a new array and tells changed ones apart", () => {
    const lines = [bundle([], { quantity: 2 }), bundle(shirtM)];
    expect(guestBundleSignature(lines.map((line) => ({ ...line })))).toBe(
      guestBundleSignature(lines),
    );
    expect(guestBundleSignature([])).toBe("");
    for (const changed of [
      [{ ...lines[0], quantity: 3 }, lines[1]],
      [{ ...lines[0], bundleVersion: 3 }, lines[1]],
      [lines[0]],
    ]) {
      expect(guestBundleSignature(changed)).not.toBe(
        guestBundleSignature(lines),
      );
    }
  });
});

describe("toGuestCartBundle", () => {
  it("keeps each component's stock identity in the snapshot", () => {
    const snapshot = toGuestCartBundle(
      resolved(bundle([]), {
        components: [
          {
            componentId: 1,
            productId: 7,
            productName: "Tote",
            productVariantId: 70,
            variantLabel: "Negro",
            quantity: 1,
            unitPriceCents: 6000,
            stock: 3,
            imageUrl: null,
            productStatus: "available",
            productAvailableDate: null,
          },
        ],
      }),
    );
    expect(snapshot.components).toEqual([
      {
        productId: 7,
        productVariantId: 70,
        productName: "Tote",
        variantLabel: "Negro",
        quantity: 1,
        imageUrl: null,
      },
    ]);
  });
});

describe("getBundleDemandLines", () => {
  it("reserves nothing for lines that cannot be checked out", () => {
    expect(
      getBundleDemandLines([
        { quantity: 2, components: [] },
        {
          quantity: 2,
          components: [
            {
              componentId: 1,
              productId: 7,
              productName: "Tote",
              productVariantId: null,
              variantLabel: null,
              quantity: 1,
              unitPriceCents: 6000,
              stock: 3,
              imageUrl: null,
              productStatus: "available",
              productAvailableDate: null,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        productId: 7,
        productVariantId: null,
        transactionType: "purchase",
        quantity: 2,
      },
    ]);
  });
});
