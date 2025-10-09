import { BaseProfile } from "@/app/api/users/definitions";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import { BaseProduct } from "@/app/lib/products/definitions";
import Image from "next/image";
import StoreItemQuantityInput from "./store-item-quantity-input";
import { ProductStatusBadge } from "@/components/molecules/ProductStatusBadge";

type StoreItemCardProps = {
	product: BaseProduct;
	user?: BaseProfile;
};

export default function StoreItemCard({ product, user }: StoreItemCardProps) {
	return (
		<Card className="overflow-hidden transition-all hover:shadow-lg max-w-80">
			<div className="relative h-80 w-80 bg-muted">
				{product.imageUrl ? (
					<Image
						src={product.imageUrl}
						alt={product.name}
						width={320}
						height={320}
						placeholder="blur"
						blurDataURL="/img/placeholders/placeholder-300x300.png"
					/>
				) : (
					<Image
						src="/img/placeholders/placeholder-300x300.png"
						alt="Imagen no disponible"
						width={320}
						height={320}
					/>
				)}
				<ProductStatusBadge
					status={product.status}
					discount={product.discount}
					discountUnit={product.discountUnit}
				/>
			</div>
			<CardContent className="p-4">
				<h3 className="font-semibold text-lg">{product.name}</h3>
				<p className="text-muted-foreground text-sm">{product.description}</p>
				<div className="mt-2 font-bold">Bs{product.price.toFixed(2)}</div>
				{product.isPreOrder && product.availableDate && (
					<p className="text-xs text-amber-600 mt-1">
						Disponible el {formatDate(product.availableDate).toLocaleString()}
					</p>
				)}
				<StoreItemQuantityInput product={product} user={user} />
			</CardContent>
		</Card>
	);
}
