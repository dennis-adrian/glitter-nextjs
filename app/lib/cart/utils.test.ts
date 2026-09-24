import { describe, expect, it } from "vitest";

import type { GuestCartBundle } from "@/app/lib/cart/definitions";
import type { BundleSelectionInput } from "@/app/lib/merch/bundle-definitions";
import {
  buildBundleLineKey,
  getBundleDemandLines,
  replaceGuestBundleLine,
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
    ).toEqual([{ ...accepted, quantity: 5 }]);
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
    expect(result).toEqual([
      { ...accepted, lineKey: legacy.lineKey, selections: shirtM },
      stale,
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
