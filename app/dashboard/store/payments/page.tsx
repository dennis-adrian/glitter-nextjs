import VoucherQueue from "@/app/components/organisms/orders/voucher-queue";
import { Skeleton } from "@/app/components/ui/skeleton";
import { fetchPendingVoucherReviewOrders } from "@/app/lib/orders/actions";
import { Suspense } from "react";

function PaymentsPageSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-36 w-full rounded-2xl" />
			<div className="space-y-3">
				{Array.from({ length: 3 }).map((_, index) => (
					<Skeleton key={index} className="h-28 w-full rounded-2xl" />
				))}
			</div>
		</div>
	);
}

export default function StorePaymentsPage() {
	const ordersPromise = fetchPendingVoucherReviewOrders();

	return (
		<Suspense fallback={<PaymentsPageSkeleton />}>
			<VoucherQueue ordersPromise={ordersPromise} />
		</Suspense>
	);
}
