"use client";

import OrdersDateFilter from "@/app/components/organisms/orders/orders-date-filter";
import {
  profitabilityQueryToSearchParams,
  type ProfitabilityQuery,
} from "@/app/lib/orders/profitability-query-schema";
import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * The analytics page's single clock. Every section below reads the same
 * window from the URL, so the KPIs, the sales chart and the profitability
 * report can't disagree about which period they describe.
 */
export default function StorePeriodFilter({
  query,
}: {
  query: ProfitabilityQuery;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function updateQuery(next: ProfitabilityQuery) {
    startTransition(() => {
      router.replace(`${pathname}?${profitabilityQueryToSearchParams(next)}`, {
        scroll: false,
      });
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 transition-opacity",
        "lg:flex-row lg:items-center lg:justify-between",
        isPending && "opacity-60",
      )}
    >
      <OrdersDateFilter
        period={query.period}
        dateFrom={query.from ?? ""}
        dateTo={query.to ?? ""}
        hasCustomRange={query.period === "custom"}
        onPeriodChange={(period) =>
          updateQuery({ ...query, period, from: undefined, to: undefined })
        }
        onFromChange={(from) =>
          updateQuery({ ...query, period: "custom", from: from || undefined })
        }
        onToChange={(to) =>
          updateQuery({ ...query, period: "custom", to: to || undefined })
        }
      />
      {isPending && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
          Actualizando
        </span>
      )}
    </div>
  );
}
