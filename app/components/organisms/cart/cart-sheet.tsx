"use client";

import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/app/components/ui/sheet";
import { useCart } from "@/app/components/providers/cart-provider";
import { fetchCartWithItems } from "@/app/lib/cart/actions";
import { getCartItemWarnings } from "@/app/lib/cart/utils";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { CartWithItems } from "@/app/lib/cart/definitions";
import { BaseProfile } from "@/app/api/users/definitions";
import CartItemRow from "@/app/components/organisms/cart/cart-item-row";
import { Button } from "@/app/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCartIcon } from "lucide-react";

type CartSheetProps = {
	user: BaseProfile;
};

export default function CartSheet({ user }: CartSheetProps) {
	const { isOpen, closeCart, setItemCount } = useCart();
	const router = useRouter();
	const [cartData, setCartData] = useState<CartWithItems | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const fetchGenerationRef = useRef(0);

	const loadCart = useCallback(
		async (silent = false) => {
			if (!silent) setLoading(true);
			else setRefreshing(true);

			const generation = ++fetchGenerationRef.current;
			try {
				const data = await fetchCartWithItems(user.id);
				if (generation === fetchGenerationRef.current) {
					setCartData(data);
					setItemCount(
						data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
					);
				}
			} finally {
				if (!silent) setLoading(false);
				else setRefreshing(false);
			}
		},
		[user.id, setItemCount],
	);

	useEffect(() => {
		if (isOpen) {
			loadCart();
		}
	}, [isOpen, loadCart]);

	const hasWarnings = cartData?.items.some((item) => {
		const w = getCartItemWarnings(item);
		return w.isOutOfStock || w.quantityExceedsStock;
	});

	const total =
		cartData?.items.reduce((sum, item) => {
			return sum + getProductPriceAtPurchase(item.product) * item.quantity;
		}, 0) ?? 0;

	return (
		<Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
			<SheetContent
				side="right"
				className="flex flex-col w-full sm:max-w-md p-0"
			>
				<SheetHeader className="px-6 py-4 border-b">
					<SheetTitle className="flex items-center gap-2">
						<ShoppingCartIcon className="w-5 h-5" />
						Tu carrito
					</SheetTitle>
				</SheetHeader>

				{/* Cart items */}
				<div className="flex-1 overflow-y-auto px-6">
					{loading && (
						<p className="text-sm text-muted-foreground py-8 text-center">
							Cargando...
						</p>
					)}

					{!loading && (!cartData || cartData.items.length === 0) && (
						<div className="flex flex-col items-center justify-center h-full py-16 gap-3 text-muted-foreground">
							<ShoppingCartIcon className="w-12 h-12 opacity-30" />
							<p className="text-sm">Tu carrito está vacío</p>
						</div>
					)}

					{!loading && cartData && cartData.items.length > 0 && (
						<div>
							{cartData.items.map((item) => (
								<CartItemRow
									key={item.id}
									item={item}
									userId={user.id}
									onCartUpdate={() => loadCart(true)}
								/>
							))}
						</div>
					)}
				</div>

				{/* Footer */}
				{!loading && cartData && cartData.items.length > 0 && (
					<div className="px-6 py-4 border-t space-y-4">
						{hasWarnings && (
							<p className="text-xs text-amber-600">
								Revisá tu carrito, algunos productos cambiaron de
								disponibilidad.
							</p>
						)}
						<div className="flex items-center justify-between font-semibold">
							<span>Total</span>
							<span>Bs {total.toFixed(2)}</span>
						</div>
						<Button
							disabled={!!hasWarnings || refreshing}
							className="w-full bg-purple-600 hover:bg-purple-700"
							onClick={() => {
								closeCart();
								router.push("/checkout");
							}}
						>
							Proceder al pago
						</Button>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
