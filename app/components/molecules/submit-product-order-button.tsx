"use client";

import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { BaseProduct } from "@/app/lib/products/definitions";
import { cn } from "@/app/lib/utils";

export default function SubmitProductOrderButton({
	className,
	product,
	disabled,
	loading,
}: {
	className?: string;
	product: BaseProduct;
	disabled: boolean;
	loading: boolean;
}) {
	if ((product.stock ?? 0) <= 0) {
		return (
			<Button
				className="bg-muted text-muted-foreground hover:bg-muted hover:translate-y-0"
				disabled={disabled}
				type="button"
			>
				Agotado
			</Button>
		);
	}

	return (
		<SubmitButton
			className={cn(
				"w-full",
				product.isPreOrder
					? "bg-amber-600 hover:bg-amber-700"
					: "bg-purple-600 hover:bg-purple-700",
				className,
			)}
			disabled={disabled}
			loading={loading}
			label={`${product.isPreOrder ? "Quiero reservar" : "Hacer pedido"}`}
		/>
	);
}
