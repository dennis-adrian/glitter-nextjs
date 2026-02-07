import { RedirectButton } from "@/app/components/redirect-button";
import { Card, CardContent } from "@/app/components/ui/card";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { fetchFeaturedProducts } from "@/app/lib/products/actions";
import { validatedDiscount } from "@/app/lib/orders/utils";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import {
	ArrowRightIcon,
	PackageOpenIcon,
	ShoppingBagIcon,
} from "lucide-react";
import Image from "next/image";

export default async function StoreShowcaseSection() {
	const products = await fetchFeaturedProducts(4);

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-lg font-semibold flex items-center gap-2">
					<ShoppingBagIcon className="w-5 h-5" />
					Tiendita Glitter
				</h2>
				<RedirectButton
					href="/store"
					variant="link"
					size="sm"
					className="p-0 h-auto text-xs"
				>
					Ver toda la tienda
					<ArrowRightIcon className="ml-1 w-3 h-3" />
				</RedirectButton>
			</div>

			{products.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
						<PackageOpenIcon className="w-12 h-12" />
						<span className="text-sm">
							No hay productos disponibles por el momento
						</span>
					</CardContent>
				</Card>
			) : (
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
					{products.map((product) => (
						<CompactProductCard key={product.id} product={product} />
					))}
				</div>
			)}
		</div>
	);
}

function CompactProductCard({ product }: { product: BaseProductWithImages }) {
	const mainImage = product.images.find((img) => img.isMain);
	const imageUrl =
		mainImage?.imageUrl ||
		product.images[0]?.imageUrl ||
		PLACEHOLDER_IMAGE_URLS["500"];

	let price = product.price;
	let originalPrice: number | null = null;

	if (product.discount && product.discountUnit === "percentage") {
		const validDiscount = validatedDiscount(
			product.price,
			product.discount,
			product.discountUnit,
		);
		originalPrice = product.price;
		price = product.price * (1 - validDiscount / 100);
	} else if (product.discount && product.discountUnit === "amount") {
		const validDiscount = validatedDiscount(
			product.price,
			product.discount,
			product.discountUnit,
		);
		originalPrice = product.price;
		price = product.price - validDiscount;
	}

	return (
		<Card className="overflow-hidden hover:shadow-md transition-shadow">
			<div className="relative aspect-square">
				<Image
					src={imageUrl}
					alt={product.name}
					fill
					className="object-cover"
					sizes="(max-width: 768px) 50vw, 25vw"
				/>
			</div>
			<CardContent className="p-3">
				<h3 className="text-sm font-medium truncate">{product.name}</h3>
				<div className="flex items-baseline gap-1 mt-1">
					<span className="text-sm font-semibold">
						Bs{price.toFixed(2)}
					</span>
					{originalPrice && (
						<span className="text-xs text-muted-foreground line-through">
							Bs{originalPrice.toFixed(2)}
						</span>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
