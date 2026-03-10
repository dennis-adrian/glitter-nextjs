import { Badge } from "@/app/components/ui/badge";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { formatDate } from "@/app/lib/formatters";
import { OrderItemWithRelations } from "@/app/lib/orders/definitions";
import Image from "next/image";

export default function OrderItemOverview({
	item,
}: {
	item: OrderItemWithRelations;
}) {
	const mainImage = item.product.images.find((img) => img.isMain);
	const imageUrl = mainImage?.imageUrl
		? mainImage.imageUrl
		: PLACEHOLDER_IMAGE_URLS["300"];

	return (
		<div className="flex gap-3">
			<div className="relative">
				<Image
					className="rounded-md"
					src={imageUrl}
					alt="imagen del producto"
					width={60}
					height={60}
				/>
				<Badge
					variant="outline"
					className="text-xs absolute -bottom-[2px] -right-[4px] bg-white rounded-full"
				>
					{item.quantity}
				</Badge>
			</div>
			<div>
				<p className="text-card-foreground font-semibold text-sm">
					{item.product.name}
				</p>
				<p className="text-card-foreground text-xs">
					Bs{item.priceAtPurchase.toFixed(2)}
				</p>
				{item.product.availableDate && (
					<p className="text-xs text-amber-600">
						Disponible el{" "}
						{formatDate(item.product.availableDate).toLocaleString()}
					</p>
				)}
			</div>
		</div>
	);
}
