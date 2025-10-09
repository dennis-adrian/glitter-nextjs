import { Badge } from "@/app/components/ui/badge";
import { formatDate } from "@/app/lib/formatters";
import { OrderItemWithRelations } from "@/app/lib/orders/definitions";
import Image from "next/image";

export default function OrderItemOverview({
	item,
}: {
	item: OrderItemWithRelations;
}) {
	return (
		<div className="flex gap-3">
			<div className="relative">
				{!item.product.imageUrl ? (
					<Image
						src="/img/placeholers/placeholder-300x300.png"
						alt="imagen por defecto"
						width={60}
						height={70}
					/>
				) : (
					<Image
						className="rounded-md"
						src={item.product.imageUrl}
						alt="imagen del producto"
						width={60}
						height={60}
					/>
				)}
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
