import OrdersCardList from "@/app/components/organisms/orders/orders-card-list";
import OrdersTable from "@/app/components/organisms/orders/table";
import TableSkeleton from "@/app/components/users/skeletons/table";
import {
  fetchOrderStatusCounts,
  fetchOrdersForAdmin,
} from "@/app/lib/orders/actions";
import { parseStoreOrdersQuery } from "@/app/lib/orders/query-schema";
import { Suspense } from "react";

export default async function StoreOrdersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await props.searchParams;
  const query = parseStoreOrdersQuery(raw);
  const ordersPromise = fetchOrdersForAdmin(query);
  // Counts ignore the status filter so each facet can show what it would
  // return under the filters that are actually active.
  const countsPromise = fetchOrderStatusCounts(query);

  return (
    <div className="space-y-4">
      <div className="block lg:hidden" data-testid="orders-card-view">
        <Suspense fallback={<TableSkeleton />}>
          <OrdersCardList
            ordersPromise={ordersPromise}
            countsPromise={countsPromise}
            query={query}
          />
        </Suspense>
      </div>

      <div className="hidden lg:block" data-testid="orders-table-view">
        <Suspense fallback={<TableSkeleton />}>
          <OrdersTable
            ordersPromise={ordersPromise}
            countsPromise={countsPromise}
            query={query}
          />
        </Suspense>
      </div>
    </div>
  );
}
