import OrdersCardList from "@/app/components/organisms/orders/orders-card-list";
import OrdersTable from "@/app/components/organisms/orders/table";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { fetchOrdersByStatus } from "@/app/lib/orders/actions";
import type { RentalOrderFilter } from "@/app/lib/rentals/order-filters";
import { orderStatusEnum } from "@/db/schema";
import { Suspense } from "react";
import { z } from "zod";

const STATUS_VALUES = [
  ...orderStatusEnum.enumValues,
  "all",
  "needs_attention",
] as const;

const RENTAL_FILTER_VALUES = [
  "all",
  "has_rental",
  "out",
  "partially_returned",
  "returned",
] as const satisfies readonly RentalOrderFilter[];

const SearchParamsSchema = z.object({
  status: z.enum(STATUS_VALUES).catch("pending"),
  rental: z.enum(RENTAL_FILTER_VALUES).catch("all"),
});

export default async function StoreOrdersPage(props: {
  searchParams: Promise<Record<string, string>>;
}) {
  const raw = await props.searchParams;
  const { status, rental } = SearchParamsSchema.parse(raw);
  const statusFilter =
    status === "all"
      ? undefined
      : status === "needs_attention"
        ? (["pending", "payment_verification"] as const)
        : status;
  const ordersPromise = fetchOrdersByStatus(statusFilter, rental);

  return (
    <div className="space-y-4">
      <div className="block md:hidden">
        <Suspense fallback={<TableSkeleton />}>
          <OrdersCardList
            ordersPromise={ordersPromise}
            activeStatus={status}
            activeRentalFilter={rental}
          />
        </Suspense>
      </div>

      <div className="hidden md:block">
        <Suspense fallback={<TableSkeleton />}>
          <OrdersTable
            ordersPromise={ordersPromise}
            activeStatus={status}
            activeRentalFilter={rental}
          />
        </Suspense>
      </div>
    </div>
  );
}
