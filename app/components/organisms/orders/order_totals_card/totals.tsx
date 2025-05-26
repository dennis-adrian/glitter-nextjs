"use client";

import OrderTotalsCard from "@/app/components/organisms/orders/order_totals_card/card";
import { OrderStatus } from "@/app/lib/orders/definitions";
import { use, useMemo } from "react";

type OrdersTotalsProps = {
	ordersTotalsPromise: Promise<
		{
			productId: number;
			productName: string;
			status: OrderStatus;
			totalQuantity: number;
		}[]
	>;
};

export default function OrdersTotals(props: OrdersTotalsProps) {
	const ordersTotals = use(props.ordersTotalsPromise);

	const groupedProducts = useMemo(
		() =>
			ordersTotals.reduce(
				(acc, curr) => {
					const productId = curr.productId;
					const status = curr.status;
					const totalQuantity = curr.totalQuantity;

					acc[productId] = {
						productName: curr.productName,
						totals: {
							...acc[productId]?.totals,
							[status]: totalQuantity,
						},
						allTotalsSum: (acc[productId]?.allTotalsSum || 0) + totalQuantity,
					};
					return acc;
				},
				{} as Record<
					number,
					{
						productName: string;
						totals: Record<OrderStatus, number>;
						allTotalsSum: number;
					}
				>,
			),
		[ordersTotals],
	);

	return Object.entries(groupedProducts).map(([productId, product]) => (
		<OrderTotalsCard key={productId} product={product} />
	));
}
