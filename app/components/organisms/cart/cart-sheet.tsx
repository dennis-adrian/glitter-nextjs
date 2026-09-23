"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { BundleCartRow } from "@/app/components/organisms/cart/bundle-cart-row";
import CartItemRow from "@/app/components/organisms/cart/cart-item-row";
import { CartSheetCheckoutFooter } from "@/app/components/organisms/cart/cart-sheet-checkout-footer";
import { CartSheetEmptyState } from "@/app/components/organisms/cart/cart-sheet-empty-state";
import { CartSheetShell } from "@/app/components/organisms/cart/cart-sheet-shell";
import GuestCartItemRow from "@/app/components/organisms/cart/guest-cart-item-row";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { Button } from "@/app/components/ui/button";
import {
  acceptCartBundleChanges,
  fetchCartItemCount,
  fetchCartWithItems,
  removeCartBundle,
  resolveGuestCartBundles,
  updateCartBundleQuantity,
  validateGuestCartStock,
  type GuestBundleInput,
  type GuestStockValidationResult,
} from "@/app/lib/cart/actions";
import type {
  CartWithItems,
  GuestCartBundle,
  GuestCartItem,
} from "@/app/lib/cart/definitions";
import {
  getBundleDemandLines,
  getCartItemWarnings,
  toGuestCartBundle,
} from "@/app/lib/cart/utils";
import type { CartBundleLine } from "@/app/lib/merch/bundle-definitions";
import {
  getLineUnitPrice,
  getProductPriceAtPurchase,
} from "@/app/lib/orders/utils";
import CartItemSkeleton from "./cart-item-skeleton";

function toGuestBundleInputs(bundles: GuestCartBundle[]): GuestBundleInput[] {
  return bundles.map((bundle) => ({
    lineKey: bundle.lineKey,
    bundleId: bundle.bundleId,
    bundleVersion: bundle.bundleVersion,
    quantity: bundle.quantity,
    selections: bundle.selections,
  }));
}

function toGuestItemInputs(items: GuestCartItem[]) {
  return items.map((i) => ({
    lineKey: i.lineKey,
    productId: i.productId,
    productVariantId: i.productVariantId,
    quantity: i.quantity,
  }));
}

function AuthBundleCartRow({
  line,
  onCartUpdate,
}: {
  line: CartBundleLine;
  onCartUpdate: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  async function run(
    action: () => Promise<{ success: boolean; error?: string }>,
    fallback: string,
  ) {
    setPending(true);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(
          result.error === "stock_insufficient"
            ? "No hay stock suficiente para esa cantidad."
            : (result.error ?? fallback),
        );
      }
      await onCartUpdate();
    } catch {
      toast.error(fallback);
    } finally {
      setPending(false);
    }
  }

  return (
    <BundleCartRow
      name={line.name}
      imageUrl={line.imageUrl}
      unitPriceCents={line.unitPriceCents}
      separateUnitPriceCents={line.separateUnitPriceCents}
      quantity={line.quantity}
      maxQuantity={line.maxQuantity}
      components={line.components}
      issue={line.issue}
      message={line.message}
      pending={pending}
      onQuantityChange={(quantity) =>
        run(
          () => updateCartBundleQuantity(line.cartBundleId!, quantity),
          "No se pudo actualizar la cantidad",
        )
      }
      onRemove={() =>
        run(
          () => removeCartBundle(line.cartBundleId!),
          "No se pudo eliminar el combo del carrito",
        )
      }
      onAcceptChanges={() =>
        run(
          () => acceptCartBundleChanges(line.cartBundleId!),
          "No se pudo actualizar el combo",
        )
      }
    />
  );
}

export default function CartSheet() {
  const {
    isOpen,
    closeCart,
    setItemCount,
    isAuthenticated,
    guestItems,
    guestBundles,
    removeGuestBundle,
    updateGuestBundleQuantity,
    replaceGuestBundle,
  } = useCartContext();
  const router = useRouter();
  const [cartData, setCartData] = useState<CartWithItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const fetchGenerationRef = useRef(0);
  const [guestValidating, setGuestValidating] = useState(false);
  const [guestStockIssues, setGuestStockIssues] = useState<
    GuestStockValidationResult[]
  >([]);
  const [guestBundleLines, setGuestBundleLines] = useState<
    CartBundleLine[] | null
  >(null);
  const guestBundleGenerationRef = useRef(0);

  const loadCart = useCallback(
    async (silent = false) => {
      if (!isAuthenticated) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setFetchError(false);

      const generation = ++fetchGenerationRef.current;
      try {
        const result = await fetchCartWithItems();
        if (generation === fetchGenerationRef.current) {
          if (result.success) {
            setCartData(result.data);
            setFetchError(false);
            setItemCount(
              (result.data?.items.reduce(
                (sum, item) => sum + item.quantity,
                0,
              ) ?? 0) +
                (result.data?.bundles.reduce(
                  (sum, bundle) => sum + bundle.quantity,
                  0,
                ) ?? 0),
            );
          } else {
            setFetchError(true);
            toast.error("No se pudo cargar el carrito");
          }
        }
      } catch {
        if (generation === fetchGenerationRef.current) {
          setFetchError(true);
          toast.error("No se pudo cargar el carrito");
        }
      } finally {
        if (!silent) setLoading(false);
        else setRefreshing(false);
      }
    },
    [setItemCount, isAuthenticated],
  );

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      loadCart();
    }
  }, [isOpen, isAuthenticated, loadCart]);

  // Sync count from server on mount for authenticated users
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchCartItemCount()
      .then(setItemCount)
      .catch(() => {
        toast.error("No se pudo cargar el carrito");
      });
  }, [setItemCount, isAuthenticated]);

  // Guest bundles are re-priced and stock-checked on the server whenever the
  // open cart changes; the stored snapshot is only a fallback while loading.
  useEffect(() => {
    if (isAuthenticated || !isOpen || guestBundles.length === 0) return;
    const generation = ++guestBundleGenerationRef.current;
    resolveGuestCartBundles(
      toGuestBundleInputs(guestBundles),
      toGuestItemInputs(guestItems),
    )
      .then((lines) => {
        if (generation === guestBundleGenerationRef.current) {
          setGuestBundleLines(lines);
        }
      })
      .catch(() => {
        if (generation === guestBundleGenerationRef.current) {
          setGuestBundleLines(null);
        }
      });
  }, [isAuthenticated, isOpen, guestBundles, guestItems]);

  // ── Guest cart ────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    const resolvedByKey = new Map(
      (guestBundleLines ?? []).map((line) => [line.key, line]),
    );
    const guestDisplayBundles = guestBundles.map((bundle) => ({
      bundle,
      line: resolvedByKey.get(bundle.lineKey) ?? null,
    }));
    const guestTotal =
      guestItems.reduce(
        (sum, item) =>
          sum +
          getProductPriceAtPurchase(item.product, item.variant) * item.quantity,
        0,
      ) +
      guestDisplayBundles.reduce(
        (sum, { bundle, line }) =>
          sum +
          ((line?.unitPriceCents || bundle.unitPriceCents) * bundle.quantity) /
            100,
        0,
      );
    const stockIssuesMap = new Map(guestStockIssues.map((s) => [s.lineKey, s]));
    const hasBundleIssues = guestDisplayBundles.some(
      ({ line }) => line?.issue != null,
    );
    const hasStockIssues =
      guestStockIssues.some((s) => s.isOutOfStock || s.quantityExceedsStock) ||
      hasBundleIssues;
    const isEmpty = guestItems.length === 0 && guestBundles.length === 0;

    async function handleGuestCheckout() {
      setGuestStockIssues([]);
      setGuestValidating(true);
      try {
        const bundleInputs = toGuestBundleInputs(guestBundles);
        const [results, bundleLines] = await Promise.all([
          validateGuestCartStock(toGuestItemInputs(guestItems), bundleInputs),
          resolveGuestCartBundles(bundleInputs, toGuestItemInputs(guestItems)),
        ]);
        setGuestBundleLines(bundleLines);
        const issues = results.filter(
          (r) => r.isOutOfStock || r.quantityExceedsStock,
        );
        if (issues.length > 0 || bundleLines.some((line) => line.issue)) {
          setGuestStockIssues(issues);
          return;
        }
        closeCart();
        router.push("/checkout");
      } catch {
        toast.error("No se pudo validar el carrito");
      } finally {
        setGuestValidating(false);
      }
    }

    return (
      <CartSheetShell
        open={isOpen}
        onClose={closeCart}
        body={
          <>
            {isEmpty && <CartSheetEmptyState />}

            {!isEmpty && (
              <div>
                {guestDisplayBundles.map(({ bundle, line }) => (
                  <BundleCartRow
                    key={bundle.lineKey}
                    name={
                      line && line.issue !== "unavailable"
                        ? line.name
                        : bundle.name
                    }
                    imageUrl={line?.imageUrl ?? bundle.imageUrl}
                    unitPriceCents={
                      line?.unitPriceCents || bundle.unitPriceCents
                    }
                    separateUnitPriceCents={
                      line?.separateUnitPriceCents ||
                      bundle.separateUnitPriceCents
                    }
                    quantity={bundle.quantity}
                    maxQuantity={line ? line.maxQuantity : null}
                    components={
                      line?.components.length
                        ? line.components
                        : bundle.components
                    }
                    issue={line?.issue ?? null}
                    message={line?.message ?? null}
                    onQuantityChange={(quantity) =>
                      updateGuestBundleQuantity(bundle.lineKey, quantity)
                    }
                    onRemove={() => removeGuestBundle(bundle.lineKey)}
                    onAcceptChanges={
                      line?.currentVersion != null
                        ? () =>
                            replaceGuestBundle(
                              bundle.lineKey,
                              toGuestCartBundle(line, {
                                bundleVersion: line.currentVersion!,
                                quantity: bundle.quantity,
                              }),
                            )
                        : undefined
                    }
                  />
                ))}
                {guestItems.map((item) => (
                  <GuestCartItemRow
                    key={item.lineKey}
                    item={item}
                    stockIssue={stockIssuesMap.get(item.lineKey)}
                  />
                ))}
              </div>
            )}
          </>
        }
        footer={
          !isEmpty ? (
            <CartSheetCheckoutFooter
              showStockWarning={hasStockIssues}
              total={guestTotal}
              onCheckout={handleGuestCheckout}
              disabled={guestValidating || hasBundleIssues}
              pending={guestValidating}
            />
          ) : undefined
        }
      />
    );
  }

  // ── Authenticated cart ────────────────────────────────────────────────────
  const bundleLines = cartData?.bundles ?? [];
  const bundleDemand = getBundleDemandLines(bundleLines);
  const hasWarnings =
    cartData?.items.some((item) => {
      const w = getCartItemWarnings(item, cartData.items, bundleDemand);
      return w.isOutOfStock || w.quantityExceedsStock;
    }) || bundleLines.some((line) => line.issue != null);

  const total =
    (cartData?.items.reduce((sum, item) => {
      return (
        sum +
        getLineUnitPrice(item.product, item.variant, item.transactionType) *
          item.quantity
      );
    }, 0) ?? 0) +
    bundleLines.reduce(
      (sum, line) => sum + (line.unitPriceCents * line.quantity) / 100,
      0,
    );
  const isEmpty =
    !cartData || (cartData.items.length === 0 && bundleLines.length === 0);

  const showAuthFooter = !loading && !fetchError && !isEmpty;

  return (
    <CartSheetShell
      open={isOpen}
      onClose={closeCart}
      body={
        <>
          {loading && (
            <div>
              <CartItemSkeleton />
              <CartItemSkeleton />
              <CartItemSkeleton />
            </div>
          )}

          {!loading && fetchError && (
            <div className="flex flex-col items-center justify-center h-full py-16 gap-3 text-muted-foreground">
              <p className="text-sm">No se pudo cargar el carrito.</p>
              <Button variant="outline" size="sm" onClick={() => loadCart()}>
                Reintentar
              </Button>
            </div>
          )}

          {!loading && !fetchError && isEmpty && <CartSheetEmptyState />}

          {!loading && !fetchError && cartData && !isEmpty && (
            <div>
              {bundleLines.map((line) => (
                <AuthBundleCartRow
                  key={line.key}
                  line={line}
                  onCartUpdate={() => loadCart(true)}
                />
              ))}
              {cartData.items.map((item) => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  allItems={cartData.items}
                  bundleDemand={bundleDemand}
                  onCartUpdate={() => loadCart(true)}
                />
              ))}
            </div>
          )}
        </>
      }
      footer={
        showAuthFooter ? (
          <CartSheetCheckoutFooter
            showStockWarning={!!hasWarnings}
            total={total}
            onCheckout={() => {
              closeCart();
              router.push("/checkout");
            }}
            disabled={!!hasWarnings || refreshing}
          />
        ) : undefined
      }
    />
  );
}
