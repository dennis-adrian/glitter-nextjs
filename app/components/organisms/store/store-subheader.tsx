"use client";

import { useCart } from "@/app/components/providers/cart-provider";
import { Button } from "@/app/components/ui/button";
import { ShoppingCartIcon } from "lucide-react";

export default function StoreSubheader() {
	const { itemCount, openCart } = useCart();

	return (
		<div className="sticky top-16 md:top-20 z-40 bg-background border-b">
			<div className="container px-3 py-3 flex items-center justify-between">
				<div>
					<h1 className="text-xl md:text-2xl font-bold tracking-tight">
						Tiendita Glitter
					</h1>
					<p className="text-xs text-muted-foreground hidden sm:block">
						Conseguí mercha oficial de nuestros festivales
					</p>
				</div>

				<Button
					variant="outline"
					size="sm"
					className="relative flex items-center gap-2"
					aria-label={itemCount > 0 ? `Abrir carrito, ${itemCount > 9 ? "9+" : itemCount}` : "Abrir carrito"}
					onClick={openCart}
				>
					<ShoppingCartIcon className="w-4 h-4" />
					<span className="hidden sm:inline">Carrito</span>
					{itemCount > 0 && (
						<span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">
							{itemCount > 9 ? "9+" : itemCount}
						</span>
					)}
				</Button>
			</div>
		</div>
	);
}
