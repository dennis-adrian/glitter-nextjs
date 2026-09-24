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
  useState,
} from "react";

/** What a guest add-to-cart did, mirroring the signed-in action's answer. */
export type GuestBundleAddOutcome = {
  success: boolean;
  /** Units actually added (0 when nothing changed). */
  added: number;
  message?: string;
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
  addGuestItem: (item: GuestCartItem) => void;
  removeGuestItem: (lineKey: string) => void;
  updateGuestItemQuantity: (lineKey: string, quantity: number) => void;
  guestBundles: GuestCartBundle[];
  /**
   * Adds a bundle after the server checks it against the whole guest cart
   * (shared stock, per-line cap, changed versions, line limit).
   */
  addGuestBundle: (
    request: BundleLineRequest,
  ) => Promise<GuestBundleAddOutcome>;
  removeGuestBundle: (lineKey: string) => void;
  updateGuestBundleQuantity: (lineKey: string, quantity: number) => void;
  /**
   * Replaces a bundle's snapshot (e.g. after the customer accepts changes),
   * merging it with a line that now names the same configuration.
   */
  replaceGuestBundle: (lineKey: string, bundle: GuestCartBundle) => void;
  /**
   * Applies a server resolution: drops lines whose bundle was deleted and
   * re-keys resolved lines canonically. Returns how many lines were dropped.
   */
  reconcileGuestBundles: (resolution: GuestCartResolution) => number;
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
  const [guestCartHydrated, setGuestCartHydrated] = useState(false);

  // Hydrate guest cart from localStorage after mount (client only).
  // When authenticated, skip localStorage but still mark hydrated so consumers never wait forever.
  useEffect(() => {
    if (!isAuthenticated) {
      setGuestItems(readGuestCart());
      setGuestBundles(readGuestBundles());
    }
    setGuestCartHydrated(true);
  }, [isAuthenticated]);

  // Another tab (or the payment page) may change or empty the stored cart;
  // re-read it so a stale copy here never writes purchased lines back.
  useEffect(() => {
    if (isAuthenticated) return;
    const reload = () => {
      setGuestItems(readGuestCart());
      setGuestBundles(readGuestBundles());
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
  }, [isAuthenticated]);

  // Guest counts derive from both line kinds; authenticated counts come from
  // the server through setItemCount.
  const cartItemCount =
    !isAuthenticated && guestCartHydrated
      ? guestItems.reduce((sum, i) => sum + i.quantity, 0) +
        guestBundles.reduce((sum, b) => sum + b.quantity, 0)
      : itemCount;

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const addGuestItem = useCallback((incoming: GuestCartItem) => {
    if (incoming.lineKey.endsWith(":rental")) {
      return;
    }
    setGuestItems((prev) => {
      const existing = prev.find((i) => i.lineKey === incoming.lineKey);
      let updatedGuestItems: GuestCartItem[];
      if (existing) {
        const newQty = Math.min(
          existing.quantity + incoming.quantity,
          MAX_CART_LINE_QUANTITY,
          incoming.variant?.stock ??
            incoming.product.stock ??
            MAX_CART_LINE_QUANTITY,
        );
        updatedGuestItems = prev.map((i) =>
          i.lineKey === incoming.lineKey ? { ...i, quantity: newQty } : i,
        );
      } else {
        const cappedQty = Math.min(
          incoming.quantity,
          MAX_CART_LINE_QUANTITY,
          incoming.variant?.stock ??
            incoming.product.stock ??
            MAX_CART_LINE_QUANTITY,
        );
        updatedGuestItems = [...prev, { ...incoming, quantity: cappedQty }];
      }
      writeGuestCart(updatedGuestItems);
      return updatedGuestItems;
    });
  }, []);

  const removeGuestItem = useCallback((lineKey: string) => {
    setGuestItems((prev) => {
      const updatedGuestItems = prev.filter((i) => i.lineKey !== lineKey);
      writeGuestCart(updatedGuestItems);
      return updatedGuestItems;
    });
  }, []);

  const updateGuestItemQuantity = useCallback(
    (lineKey: string, quantity: number) => {
      setGuestItems((prev) => {
        const guestCartLine = prev.find((i) => i.lineKey === lineKey);
        let updatedGuestItems: GuestCartItem[];

        if (quantity <= 0) {
          updatedGuestItems = prev.filter((i) => i.lineKey !== lineKey);
        } else if (!guestCartLine) {
          updatedGuestItems = prev;
        } else {
          const stockCap =
            guestCartLine.variant?.stock ??
            guestCartLine.product?.stock ??
            MAX_CART_LINE_QUANTITY;
          const clampedQty = Math.min(
            quantity,
            MAX_CART_LINE_QUANTITY,
            stockCap,
          );
          if (clampedQty <= 0) {
            updatedGuestItems = prev.filter((i) => i.lineKey !== lineKey);
          } else {
            updatedGuestItems = prev.map((i) =>
              i.lineKey === lineKey ? { ...i, quantity: clampedQty } : i,
            );
          }
        }
        writeGuestCart(updatedGuestItems);
        return updatedGuestItems;
      });
    },
    [],
  );

  const addGuestBundle = useCallback(
    async (request: BundleLineRequest): Promise<GuestBundleAddOutcome> => {
      const result = await planGuestBundleAdd(
        request,
        toGuestBundleInputs(guestBundles),
        toGuestItemInputs(guestItems),
      );
      if (!result.success) {
        return { success: false, added: 0, message: result.message };
      }
      setGuestBundles((prev) => {
        // The planned line takes the place of every line it merges.
        const replaced = new Set([...result.replaces, result.bundle.lineKey]);
        const updated: GuestCartBundle[] = [];
        for (const bundle of prev) {
          if (!replaced.has(bundle.lineKey)) updated.push(bundle);
          else if (!updated.includes(result.bundle)) {
            updated.push(result.bundle);
          }
        }
        if (!updated.includes(result.bundle)) updated.push(result.bundle);
        writeGuestBundles(updated);
        return updated;
      });
      return { success: true, added: result.added, message: result.message };
    },
    [guestBundles, guestItems],
  );

  const removeGuestBundle = useCallback((lineKey: string) => {
    setGuestBundles((prev) => {
      const updated = prev.filter((b) => b.lineKey !== lineKey);
      writeGuestBundles(updated);
      return updated;
    });
  }, []);

  const updateGuestBundleQuantity = useCallback(
    (lineKey: string, quantity: number) => {
      setGuestBundles((prev) => {
        const updated =
          quantity <= 0
            ? prev.filter((b) => b.lineKey !== lineKey)
            : prev.map((b) =>
                b.lineKey === lineKey
                  ? {
                      ...b,
                      quantity: Math.min(quantity, MAX_CART_BUNDLE_QUANTITY),
                    }
                  : b,
              );
        writeGuestBundles(updated);
        return updated;
      });
    },
    [],
  );

  const replaceGuestBundle = useCallback(
    (lineKey: string, bundle: GuestCartBundle) => {
      setGuestBundles((prev) => {
        const updated = replaceGuestBundleLine(prev, lineKey, bundle);
        writeGuestBundles(updated);
        return updated;
      });
    },
    [],
  );

  const reconcileGuestBundles = useCallback(
    (resolution: GuestCartResolution) => {
      const removed = new Set(resolution.removedBundleKeys);
      // Lines waiting for a price confirmation keep their key until accepted.
      const rekeys = resolution.bundles.filter(
        (line) =>
          line.issue !== "stale" &&
          line.issue !== "unavailable" &&
          line.issue !== "selection_invalid" &&
          buildBundleLineKey(line.bundleId, line.selections) !== line.key,
      );
      if (removed.size === 0 && rekeys.length === 0) return 0;
      setGuestBundles((prev) => {
        let updated = prev.filter((bundle) => !removed.has(bundle.lineKey));
        let changed = updated.length !== prev.length;
        for (const line of rekeys) {
          const current = updated.find((bundle) => bundle.lineKey === line.key);
          if (!current) continue;
          const lineKey = buildBundleLineKey(line.bundleId, line.selections);
          const holder = updated.find((bundle) => bundle.lineKey === lineKey);
          // The key belongs to a line still awaiting confirmation; they merge
          // once it is accepted.
          if (holder && holder.bundleVersion !== current.bundleVersion) {
            continue;
          }
          updated = replaceGuestBundleLine(updated, line.key, {
            ...current,
            lineKey,
            selections: line.selections,
          });
          changed = true;
        }
        // Unchanged state keeps its identity, so it does not trigger another
        // resolution.
        if (!changed) return prev;
        writeGuestBundles(updated);
        return updated;
      });
      return removed.size;
    },
    [],
  );

  const clearGuestCart = useCallback(() => {
    setGuestItems([]);
    writeGuestCart([]);
    setGuestBundles([]);
    writeGuestBundles([]);
    setItemCount(0);
  }, []);

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
