"use client";

import { Button } from "@/app/components/ui/button";

type CartSheetCheckoutFooterProps = {
	showStockWarning: boolean;
	total: number;
	onCheckout: () => void;
	disabled: boolean;
	/** When true, button label shows pending copy (e.g. guest stock validation). */
	pending?: boolean;
};

export function CartSheetCheckoutFooter({
	showStockWarning,
	total,
	onCheckout,
	disabled,
	pending = false,
}: CartSheetCheckoutFooterProps) {
	return (
		<div className="px-6 py-4 border-t space-y-4">
			{showStockWarning && (
				<p className="text-xs text-amber-600">
					Revisá tu carrito, algunos productos cambiaron de disponibilidad.
				</p>
			)}
			<div className="flex items-center justify-between font-semibold">
				<span>Total</span>
				<span>Bs {total.toFixed(2)}</span>
			</div>
			<Button
				disabled={disabled || pending}
				className="w-full bg-primary hover:bg-primary/90"
				onClick={onCheckout}
			>
				{pending ? "Verificando..." : "Proceder al pago"}
			</Button>
		</div>
	);
}
