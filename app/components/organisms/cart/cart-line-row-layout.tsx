"use client";

import { Trash2Icon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import { Button } from "@/app/components/ui/button";

type CartLineRowLayoutProps = {
	imageUrl: string;
	productName: string;
	unitPrice: number;
	subtotal: number;
	warnings: ReactNode;
	quantityControl: ReactNode;
	onRemove: () => void;
	removeDisabled?: boolean;
};

export function CartLineRowLayout({
	imageUrl,
	productName,
	unitPrice,
	subtotal,
	warnings,
	quantityControl,
	onRemove,
	removeDisabled = false,
}: CartLineRowLayoutProps) {
	return (
		<div className="flex gap-3 py-4 border-b last:border-b-0">
			<div className="shrink-0 w-16 h-16 rounded-md overflow-hidden bg-muted">
				<Image
					src={imageUrl}
					alt={productName}
					width={64}
					height={64}
					className="w-full h-full object-cover"
				/>
			</div>

			<div className="flex-1 min-w-0">
				<p className="font-medium text-sm truncate">{productName}</p>
				<p className="text-sm text-muted-foreground">
					Bs {unitPrice.toFixed(2)}
				</p>

				{warnings}

				<div className="mt-2">{quantityControl}</div>
			</div>

			<div className="flex flex-col items-end justify-between shrink-0">
				<p className="text-sm font-semibold">Bs {subtotal.toFixed(2)}</p>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-muted-foreground hover:text-destructive"
					aria-label="Eliminar producto del carrito"
					disabled={removeDisabled}
					onClick={onRemove}
				>
					<Trash2Icon className="w-4 h-4" />
				</Button>
			</div>
		</div>
	);
}
