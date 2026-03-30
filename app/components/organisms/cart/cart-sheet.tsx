"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import CartItemRow from "@/app/components/organisms/cart/cart-item-row";
import { CartSheetCheckoutFooter } from "@/app/components/organisms/cart/cart-sheet-checkout-footer";
import { CartSheetEmptyState } from "@/app/components/organisms/cart/cart-sheet-empty-state";
import { CartSheetShell } from "@/app/components/organisms/cart/cart-sheet-shell";
import GuestCartItemRow from "@/app/components/organisms/cart/guest-cart-item-row";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { Button } from "@/app/components/ui/button";
import {
	fetchCartItemCount,
	fetchCartWithItems,
	validateGuestCartStock,
	type GuestStockValidationResult,
} from "@/app/lib/cart/actions";
import { CartWithItems } from "@/app/lib/cart/definitions";
import { getCartItemWarnings } from "@/app/lib/cart/utils";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import CartItemSkeleton from "./cart-item-skeleton";

export default function CartSheet() {
	const { isOpen, closeCart, setItemCount, isAuthenticated, guestItems } =
		useCartContext();
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
							result.data?.items.reduce(
								(sum, item) => sum + item.quantity,
								0,
							) ?? 0,
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

	// ── Guest cart ────────────────────────────────────────────────────────────
	if (!isAuthenticated) {
		const guestTotal = guestItems.reduce(
			(sum, item) =>
				sum + getProductPriceAtPurchase(item.product) * item.quantity,
			0,
		);
		const stockIssuesMap = new Map(
			guestStockIssues.map((s) => [s.productId, s]),
		);
		const hasStockIssues = guestStockIssues.some(
			(s) => s.isOutOfStock || s.quantityExceedsStock,
		);

		async function handleGuestCheckout() {
			setGuestStockIssues([]);
			setGuestValidating(true);
			try {
				const results = await validateGuestCartStock(
					guestItems.map((i) => ({
						productId: i.productId,
						quantity: i.quantity,
					})),
				);
				const issues = results.filter(
					(r) => r.isOutOfStock || r.quantityExceedsStock,
				);
				if (issues.length > 0) {
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
						{guestItems.length === 0 && <CartSheetEmptyState />}

						{guestItems.length > 0 && (
							<div>
								{guestItems.map((item) => (
									<GuestCartItemRow
										key={item.productId}
										item={item}
										stockIssue={stockIssuesMap.get(item.productId)}
									/>
								))}
							</div>
						)}
					</>
				}
				footer={
					guestItems.length > 0 ? (
						<CartSheetCheckoutFooter
							showStockWarning={hasStockIssues}
							total={guestTotal}
							onCheckout={handleGuestCheckout}
							disabled={guestValidating}
							pending={guestValidating}
						/>
					) : undefined
				}
			/>
		);
	}

	// ── Authenticated cart ────────────────────────────────────────────────────
	const hasWarnings = cartData?.items.some((item) => {
		const w = getCartItemWarnings(item);
		return w.isOutOfStock || w.quantityExceedsStock;
	});

	const total =
		cartData?.items.reduce((sum, item) => {
			return sum + getProductPriceAtPurchase(item.product) * item.quantity;
		}, 0) ?? 0;

	const showAuthFooter =
		!loading && !fetchError && cartData && cartData.items.length > 0;

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

					{!loading &&
						!fetchError &&
						cartData &&
						cartData.items.length === 0 && <CartSheetEmptyState />}

					{!loading && !fetchError && cartData && cartData.items.length > 0 && (
						<div>
							{cartData.items.map((item) => (
								<CartItemRow
									key={item.id}
									item={item}
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
