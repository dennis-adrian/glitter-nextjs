"use client";

import { ShoppingCartIcon } from "lucide-react";

export function CartSheetEmptyState() {
	return (
		<div className="flex flex-col items-center justify-center h-full py-16 gap-3 text-muted-foreground">
			<ShoppingCartIcon className="w-12 h-12 opacity-30" />
			<p className="text-sm">Tu carrito está vacío</p>
		</div>
	);
}
