import { Suspense } from "react";

import CreditOverview from "@/app/components/credits/admin/credit-overview";
import { Skeleton } from "@/app/components/ui/skeleton";

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 w-full lg:col-span-2" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}

export default function CreditsDashboardPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <CreditOverview />
    </Suspense>
  );
}
