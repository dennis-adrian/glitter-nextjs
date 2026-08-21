import OrdersCardList from "@/app/components/organisms/orders/orders-card-list";
import OrdersTable from "@/app/components/organisms/orders/table";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { fetchOrdersForAdmin } from "@/app/lib/orders/actions";
import { parseStoreOrdersQuery } from "@/app/lib/orders/query-schema";
import { Suspense } from "react";

export default async function StoreOrdersPage(props: {
  searchParams: Promise<Record<string, string>>;
}) {
  const raw = await props.searchParams;
  const query = parseStoreOrdersQuery(raw);
  const ordersPromise = fetchOrdersForAdmin(query);

  return (
    <div className="space-y-4">
      <div className="block lg:hidden" data-testid="orders-card-view">
        <Suspense fallback={<TableSkeleton />}>
          <OrdersCardList ordersPromise={ordersPromise} query={query} />
        </Suspense>
      </div>

      <div className="hidden lg:block" data-testid="orders-table-view">
        <Suspense fallback={<TableSkeleton />}>
          <OrdersTable ordersPromise={ordersPromise} query={query} />
        </Suspense>
      </div>
    </div>
  );
}
