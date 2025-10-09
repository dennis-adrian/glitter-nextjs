import { BaseProfile } from "@/app/api/users/definitions";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import { BaseProduct } from "@/app/lib/products/definitions";
import Image from "next/image";
import StoreItemQuantityInput from "./store-item-quantity-input";
import { ProductStatusBadge } from "@/components/molecules/ProductStatusBadge";
import { ClockIcon } from "lucide-react";

type StoreItemCardProps = {
	product: BaseProduct;
	user?: BaseProfile;
};

export default function StoreItemCard({ product, user }: StoreItemCardProps) {
	let originalPrice = null;
	let price = product.price;
	if (product.discount && product.discountUnit === "percentage") {
		originalPrice = product.price;
		price = product.price * (1 - product.discount / 100);
	} else if (product.discount && product.discountUnit === "amount") {
		originalPrice = product.price;
		price = product.price - product.discount;
	}

	return (
		<Card className="group relative bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow">
			<div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
				<ProductStatusBadge
					status={product.status}
					discount={product.discount}
					discountUnit={product.discountUnit}
				/>
			</div>

			<div className="aspect-square relative overflow-hidden bg-muted">
				<Image
					src={product.imageUrl || "/img/placeholders/placeholder-300x300.png"}
					alt={product.name}
					fill
					className="object-cover group-hover:scale-105 transition-transform duration-300"
					placeholder="blur"
					blurDataURL="/img/placeholders/placeholder-300x300.png"
				/>
			</div>

			<CardContent className="p-5">
				<h3 className="font-semibold text-lg mb-1 text-balance">
					{product.name}
				</h3>
				<p className="text-sm text-muted-foreground mb-4 text-pretty leading-relaxed">
					{product.description}
				</p>
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-baseline gap-2">
						<span className="text-2xl font-semibold">Bs{price.toFixed(2)}</span>
						{originalPrice && (
							<span className="text-sm text-muted-foreground line-through">
								Bs{originalPrice.toFixed(2)}
							</span>
						)}
					</div>
				</div>
				{product.isPreOrder && product.availableDate && (
					<p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
						<ClockIcon className="w-3 h-3" />
						Disponible el {formatDate(product.availableDate).toLocaleString()}
					</p>
				)}
				<StoreItemQuantityInput product={product} user={user} />
			</CardContent>
		</Card>
	);
}
