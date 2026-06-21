"use client";

import OrderTotalsCard from "@/app/components/organisms/orders/order_totals_card/card";
import { OrderStatus } from "@/app/lib/orders/definitions";
import { use, useMemo } from "react";

type OrdersTotalsProps = {
  ordersTotalsPromise: Promise<
    {
      productId: number;
      productVariantId: number | null;
      productVariantLabel: string | null;
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
          const key = `${curr.productId}:${curr.productVariantId ?? "base"}`;
          const status = curr.status;
          const totalQuantity = curr.totalQuantity;

          acc[key] = {
            productName: curr.productVariantLabel
              ? `${curr.productName} (${curr.productVariantLabel})`
              : curr.productName,
            totals: {
              ...acc[key]?.totals,
              [status]: totalQuantity,
            },
            allTotalsSum: (acc[key]?.allTotalsSum || 0) + totalQuantity,
          };
          return acc;
        },
        {} as Record<
          string,
          {
            productName: string;
            totals: Partial<Record<OrderStatus, number>>;
            allTotalsSum: number;
          }
        >,
      ),
    [ordersTotals],
  );

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Totales por producto</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(groupedProducts).map(([productId, product]) => (
          <OrderTotalsCard key={productId} product={product} />
        ))}
      </div>
    </div>
  );
}
