"use client";

import {
  planGuestBundleAdd,
  type GuestCartResolution,
} from "@/app/lib/cart/actions";
import type {
  GuestCartBundle,
  GuestCartItem,
} from "@/app/lib/cart/definitions";
import {
  GUEST_CART_BUNDLES_KEY,
  GUEST_CART_KEY,
  MAX_CART_LINE_QUANTITY,
} from "@/app/lib/constants";
import {
  buildBundleLineKey,
  buildCartLineKey,
  bundleLineCapNotice,
  getGuestItemStockCap,
  reconcileGuestBundleLines,
  replaceGuestBundleLine,
  toGuestBundleInputs,
  toGuestItemInputs,
} from "@/app/lib/cart/utils";
import {
  MAX_CART_BUNDLE_QUANTITY,
  type BundleLineRequest,
} from "@/app/lib/merch/bundle-schema";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/** What a guest add-to-cart did, mirroring the signed-in action's answer. */
export type GuestBundleAddOutcome = {
  success: boolean;
  /** Units that landed in the cart (0 when nothing changed). */
  added: number;
  message?: string;
};

/** What a guest product add did, and which limit held it back. */
export type GuestItemAddOutcome = {
  /** Units actually added (0 when nothing changed). */
  added: number;
  /** The per-line cap, not stock, kept units out. */
  lineCapped: boolean;
};

/** What applying a server resolution changed in the guest cart. */
export type GuestBundleReconcileOutcome = {
  /** Lines dropped because their bundle was deleted. */
  removed: number;
  /** Units left out where equal lines merged past the per-line limit. */
  droppedUnits: number;
};

type CartContextValue = {
  itemCount: number;
  setItemCount: (n: number) => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  isAuthenticated: boolean;
  // Guest cart (only populated when isAuthenticated is false)
  guestItems: GuestCartItem[];
  guestCartHydrated: boolean;
  /**
   * Caps the line by the per-line limit and its stock snapshot, net of the
   * cart's bundle lines, and says how many units were added and which limit
   * held the rest back.
   */
  addGuestItem: (item: GuestCartItem) => GuestItemAddOutcome;
  removeGuestItem: (lineKey: string) => void;
  /**
   * `maxQuantity` is the server's limit for the line when known; without it
   * the stock snapshot, net of the cart's bundle lines, caps an increase.
   */
  updateGuestItemQuantity: (
    lineKey: string,
    quantity: number,
    maxQuantity?: number,
  ) => void;
  guestBundles: GuestCartBundle[];
  /**
   * Adds a bundle after the server checks it against the whole guest cart
   * (shared stock, per-line cap, changed versions, line limit), and reports
   * the units that landed on the lines as they are once it answers.
   */
  addGuestBundle: (
    request: BundleLineRequest,
  ) => Promise<GuestBundleAddOutcome>;
  removeGuestBundle: (lineKey: string) => void;
  updateGuestBundleQuantity: (lineKey: string, quantity: number) => void;
  /**
   * Replaces a bundle's snapshot (e.g. after the customer accepts changes),
   * merging it with a line that now names the same configuration. Returns
   * the units the per-line limit left out of that merge.
   */
  replaceGuestBundle: (lineKey: string, bundle: GuestCartBundle) => number;
  /**
   * Applies a server resolution: drops lines whose bundle was deleted and
   * re-keys resolved lines canonically, merging equal ones.
   */
  reconcileGuestBundles: (
    resolution: GuestCartResolution,
  ) => GuestBundleReconcileOutcome;
  clearGuestCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCartContext() {
  const cartContext = useContext(CartContext);
  if (!cartContext) {
    throw new Error("useCartContext must be used within CartProvider");
  }
  return cartContext;
}

function isValidGuestCartProduct(
  product: unknown,
): product is GuestCartItem["product"] {
  if (
    typeof product !== "object" ||
    product === null ||
    Array.isArray(product)
  ) {
    return false;
  }

  const candidate = product as Record<string, unknown>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.name === "string" &&
    typeof candidate.price === "number" &&
    Array.isArray(candidate.images)
  );
}

function normalizeGuestCartItem(
  item: Partial<GuestCartItem>,
): GuestCartItem | null {
  if (
    typeof item.productId !== "number" ||
    typeof item.quantity !== "number" ||
    !Number.isFinite(item.quantity) ||
    item.quantity <= 0
  ) {
    return null;
  }

  const productVariantId =
    typeof item.productVariantId === "number" ? item.productVariantId : null;

  const lineKey =
    item.lineKey ?? buildCartLineKey(item.productId, productVariantId);
  if (lineKey.endsWith(":rental")) {
    return null;
  }

  if (
    !isValidGuestCartProduct(item.product) ||
    item.product.id !== item.productId
  ) {
    return null;
  }

  return {
    lineKey,
    productId: item.productId,
    productVariantId,
    productVariantLabel: item.productVariantLabel ?? null,
    quantity: item.quantity,
    product: item.product,
    variant: (item.variant as GuestCartItem["variant"]) ?? null,
  };
}

function readGuestCart(): GuestCartItem[] {
  try {
    const stored = localStorage.getItem(GUEST_CART_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Partial<GuestCartItem>[];
    return parsed
      .map(normalizeGuestCartItem)
      .filter((item): item is GuestCartItem => item !== null);
  } catch {
    return [];
  }
}

function writeGuestCart(items: GuestCartItem[]) {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  } catch {
    // localStorage unavailable (e.g. private mode quota exceeded) — ignore
  }
}

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function normalizeGuestCartBundle(
  bundle: Partial<GuestCartBundle>,
): GuestCartBundle | null {
  if (
    !isPositiveInteger(bundle.bundleId) ||
    !isPositiveInteger(bundle.bundleVersion) ||
    !isPositiveInteger(bundle.quantity) ||
    !Array.isArray(bundle.selections) ||
    !bundle.selections.every(
      (selection) =>
        isPositiveInteger(selection?.componentId) &&
        isPositiveInteger(selection?.productVariantId),
    ) ||
    typeof bundle.name !== "string" ||
    typeof bundle.unitPriceCents !== "number" ||
    !Array.isArray(bundle.components)
  ) {
    return null;
  }
  return {
    lineKey: buildBundleLineKey(bundle.bundleId, bundle.selections),
    bundleId: bundle.bundleId,
    bundleVersion: bundle.bundleVersion,
    quantity: Math.min(bundle.quantity, MAX_CART_BUNDLE_QUANTITY),
    selections: bundle.selections,
    name: bundle.name,
    slug: typeof bundle.slug === "string" ? bundle.slug : "",
    imageUrl: typeof bundle.imageUrl === "string" ? bundle.imageUrl : null,
    unitPriceCents: bundle.unitPriceCents,
    separateUnitPriceCents:
      typeof bundle.separateUnitPriceCents === "number"
        ? bundle.separateUnitPriceCents
        : bundle.unitPriceCents,
    components: bundle.components,
    ...(bundle.blocked === true ? { blocked: true } : {}),
  };
}

function readGuestBundles(): GuestCartBundle[] {
  try {
    const stored = localStorage.getItem(GUEST_CART_BUNDLES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Partial<GuestCartBundle>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeGuestCartBundle)
      .filter((bundle): bundle is GuestCartBundle => bundle !== null);
  } catch {
    return [];
  }
}

function writeGuestBundles(bundles: GuestCartBundle[]) {
  try {
    localStorage.setItem(GUEST_CART_BUNDLES_KEY, JSON.stringify(bundles));
  } catch {
    // localStorage unavailable (e.g. private mode quota exceeded) — ignore
  }
}

const GUEST_CART_CLEARED_EVENT = "glitter:guest-cart-cleared";

/**
 * Empties the persisted guest cart (products and bundles) once an order took
 * it, and tells providers mounted in this page to drop their copy; other tabs
 * follow through the `storage` event.
 */
export function clearPersistedGuestCart() {
  writeGuestCart([]);
  writeGuestBundles([]);
  window.dispatchEvent(new Event(GUEST_CART_CLEARED_EVENT));
}

export function CartProvider({
  initialItemCount,
  isAuthenticated,
  children,
}: {
  initialItemCount: number;
  isAuthenticated: boolean;
  children: React.ReactNode;
}) {
  const [itemCount, setItemCount] = useState(initialItemCount);
  const [isOpen, setIsOpen] = useState(false);
  const [guestItems, setGuestItems] = useState<GuestCartItem[]>([]);
  const [guestBundles, setGuestBundles] = useState<GuestCartBundle[]>([]);
  // The latest bundle lines, ahead of the render that shows them. Every
  // change starts from them, so one that lands after waiting on the server
  // (an add) builds on changes made meanwhile and can say what it did.
  const guestBundlesRef = useRef<GuestCartBundle[]>([]);
  const [guestCartHydrated, setGuestCartHydrated] = useState(false);

  const showGuestBundles = useCallback((bundles: GuestCartBundle[]) => {
    guestBundlesRef.current = bundles;
    setGuestBundles(bundles);
  }, []);

  /** Applies a change to the latest lines and persists it. */
  const changeGuestBundles = useCallback(
    (change: (current: GuestCartBundle[]) => GuestCartBundle[]) => {
      const current = guestBundlesRef.current;
      const next = change(current);
      // Unchanged lines keep their identity, so they trigger no other
      // resolution.
      if (next === current) return;
      writeGuestBundles(next);
      showGuestBundles(next);
    },
    [showGuestBundles],
  );

  // Hydrate guest cart from localStorage after mount (client only).
  // When authenticated, skip localStorage but still mark hydrated so consumers never wait forever.
  useEffect(() => {
    if (!isAuthenticated) {
      setGuestItems(readGuestCart());
      showGuestBundles(readGuestBundles());
    }
    setGuestCartHydrated(true);
  }, [isAuthenticated, showGuestBundles]);

  // Another tab (or the payment page) may change or empty the stored cart;
  // re-read it so a stale copy here never writes purchased lines back.
  useEffect(() => {
    if (isAuthenticated) return;
    const reload = () => {
      setGuestItems(readGuestCart());
      showGuestBundles(readGuestBundles());
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === GUEST_CART_KEY ||
        event.key === GUEST_CART_BUNDLES_KEY
      ) {
        reload();
      }
    };
    window.addEventListener(GUEST_CART_CLEARED_EVENT, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(GUEST_CART_CLEARED_EVENT, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, [isAuthenticated, showGuestBundles]);

  // Guest counts derive from both line kinds; authenticated counts come from
  // the server through setItemCount.
  const cartItemCount =
    !isAuthenticated && guestCartHydrated
      ? guestItems.reduce((sum, i) => sum + i.quantity, 0) +
        guestBundles.reduce((sum, b) => sum + b.quantity, 0)
      : itemCount;

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const addGuestItem = useCallback(
    (incoming: GuestCartItem): GuestItemAddOutcome => {
      if (incoming.lineKey.endsWith(":rental")) {
        return { added: 0, lineCapped: false };
      }
      // Bundles in the cart draw from the same stock as individual lines.
      const stockCap = getGuestItemStockCap(incoming, guestBundles);
      const currentQty =
        guestItems.find((i) => i.lineKey === incoming.lineKey)?.quantity ?? 0;
      const wanted = currentQty + incoming.quantity;
      const added = Math.max(
        0,
        Math.min(wanted, MAX_CART_LINE_QUANTITY, stockCap) - currentQty,
      );
      // Name the per-line cap whenever it binds, as bundle adds do.
      const lineCapped =
        wanted > MAX_CART_LINE_QUANTITY && stockCap >= MAX_CART_LINE_QUANTITY;
      setGuestItems((prev) => {
        const existing = prev.find((i) => i.lineKey === incoming.lineKey);
        const existingQty = existing?.quantity ?? 0;
        const newQty = Math.min(
          existingQty + incoming.quantity,
          MAX_CART_LINE_QUANTITY,
          stockCap,
        );
        // An add never lowers a line nor stores an empty one; the cart flags
        // what the stock no longer covers.
        if (newQty <= existingQty) return prev;
        const updatedGuestItems = existing
          ? prev.map((i) =>
              i.lineKey === incoming.lineKey ? { ...i, quantity: newQty } : i,
            )
          : [...prev, { ...incoming, quantity: newQty }];
        writeGuestCart(updatedGuestItems);
        return updatedGuestItems;
      });
      return { added, lineCapped };
    },
    [guestBundles, guestItems],
  );

  const removeGuestItem = useCallback((lineKey: string) => {
    setGuestItems((prev) => {
      const updatedGuestItems = prev.filter((i) => i.lineKey !== lineKey);
      writeGuestCart(updatedGuestItems);
      return updatedGuestItems;
    });
  }, []);

  const updateGuestItemQuantity = useCallback(
    (lineKey: string, quantity: number, maxQuantity?: number) => {
      setGuestItems((prev) => {
        const guestCartLine = prev.find((i) => i.lineKey === lineKey);
        let updatedGuestItems: GuestCartItem[];

        if (quantity <= 0) {
          updatedGuestItems = prev.filter((i) => i.lineKey !== lineKey);
        } else if (!guestCartLine) {
          updatedGuestItems = prev;
        } else {
          // The server's limit, when known, already nets out the cart's
          // bundles; otherwise the stored snapshot minus those bundles.
          const stockCap =
            maxQuantity ?? getGuestItemStockCap(guestCartLine, guestBundles);
          // Lowering is always allowed; raising stops where stock does.
          const clampedQty = Math.min(
            quantity,
            MAX_CART_LINE_QUANTITY,
            Math.max(stockCap, guestCartLine.quantity),
          );
          updatedGuestItems = prev.map((i) =>
            i.lineKey === lineKey ? { ...i, quantity: clampedQty } : i,
          );
        }
        writeGuestCart(updatedGuestItems);
        return updatedGuestItems;
      });
    },
    [guestBundles],
  );

  const addGuestBundle = useCallback(
    async (request: BundleLineRequest): Promise<GuestBundleAddOutcome> => {
      const result = await planGuestBundleAdd(
        request,
        toGuestBundleInputs(guestBundlesRef.current),
        toGuestItemInputs(guestItems),
      );
      if (!result.success) {
        return { success: false, added: 0, message: result.message };
      }
      let added = 0;
      changeGuestBundles((current) => {
        // The planned line takes the place of every line it merges. The
        // plan's quantity counts those lines as they were sent; another tab
        // or the cart sheet may have changed them since, so only the units
        // added land on top of what they hold now, up to the per-line cap.
        const replaced = new Set([...result.replaces, result.bundle.lineKey]);
        const held = current.reduce(
          (sum, bundle) =>
            replaced.has(bundle.lineKey) ? sum + bundle.quantity : sum,
          0,
        );
        const quantity = Math.min(
          held + result.added,
          MAX_CART_BUNDLE_QUANTITY,
        );
        added = quantity - held;
        // Nothing fits any more: an add never lowers the lines it merges.
        if (added <= 0) return current;
        const merged: GuestCartBundle = { ...result.bundle, quantity };
        const updated: GuestCartBundle[] = [];
        for (const bundle of current) {
          if (!replaced.has(bundle.lineKey)) updated.push(bundle);
          else if (!updated.includes(merged)) updated.push(merged);
        }
        if (!updated.includes(merged)) updated.push(merged);
        return updated;
      });
      // Report what landed, not what the plan expected to add.
      if (added <= 0) {
        return { success: false, added: 0, message: bundleLineCapNotice(0) };
      }
      return {
        success: true,
        added,
        message:
          added < result.added ? bundleLineCapNotice(added) : result.message,
      };
    },
    [changeGuestBundles, guestItems],
  );

  const removeGuestBundle = useCallback(
    (lineKey: string) => {
      changeGuestBundles((current) =>
        current.filter((b) => b.lineKey !== lineKey),
      );
    },
    [changeGuestBundles],
  );

  const updateGuestBundleQuantity = useCallback(
    (lineKey: string, quantity: number) => {
      changeGuestBundles((current) =>
        quantity <= 0
          ? current.filter((b) => b.lineKey !== lineKey)
          : current.map((b) =>
              b.lineKey === lineKey
                ? {
                    ...b,
                    quantity: Math.min(quantity, MAX_CART_BUNDLE_QUANTITY),
                  }
                : b,
            ),
      );
    },
    [changeGuestBundles],
  );

  const replaceGuestBundle = useCallback(
    (lineKey: string, bundle: GuestCartBundle) => {
      let droppedUnits = 0;
      changeGuestBundles((current) => {
        const replaced = replaceGuestBundleLine(current, lineKey, bundle);
        droppedUnits = replaced.droppedUnits;
        return replaced.bundles;
      });
      return droppedUnits;
    },
    [changeGuestBundles],
  );

  const reconcileGuestBundles = useCallback(
    (resolution: GuestCartResolution): GuestBundleReconcileOutcome => {
      let droppedUnits = 0;
      changeGuestBundles((current) => {
        const reconciled = reconcileGuestBundleLines(current, resolution);
        droppedUnits = reconciled.droppedUnits;
        return reconciled.bundles;
      });
      return {
        removed: new Set(resolution.removedBundleKeys).size,
        droppedUnits,
      };
    },
    [changeGuestBundles],
  );

  const clearGuestCart = useCallback(() => {
    setGuestItems([]);
    writeGuestCart([]);
    writeGuestBundles([]);
    showGuestBundles([]);
    setItemCount(0);
  }, [showGuestBundles]);

  return (
    <CartContext.Provider
      value={{
        itemCount: cartItemCount,
        setItemCount,
        isOpen,
        openCart,
        closeCart,
        isAuthenticated,
        guestItems,
        guestCartHydrated,
        addGuestItem,
        removeGuestItem,
        updateGuestItemQuantity,
        guestBundles,
        addGuestBundle,
        removeGuestBundle,
        updateGuestBundleQuantity,
        replaceGuestBundle,
        reconcileGuestBundles,
        clearGuestCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
