import Link from "next/link";

import {
  CREDIT_PURCHASE_STATUS_TAB_LABELS,
  CREDIT_PURCHASE_STATUSES,
  type CreditPurchaseStatusFilter,
  type RawSearchParams,
} from "@/app/lib/credits/admin-definitions";
import type { CreditPurchaseStatusCounts } from "@/app/lib/credits/admin-queries";
import { cn } from "@/lib/utils";

/**
 * The purchase list's states, as tabs with how many each holds under the
 * current search and filters.
 *
 * Moving between them keeps the search and filters but not the page or the
 * order: each state has its own natural order — the queue oldest first,
 * history newest first — and page four of one is rarely page four of another.
 */
export default function CreditPurchaseStatusTabs({
  status,
  counts,
  searchParams,
}: {
  status: CreditPurchaseStatusFilter;
  counts: CreditPurchaseStatusCounts;
  searchParams: RawSearchParams;
}) {
  function hrefFor(value: CreditPurchaseStatusFilter) {
    const params = new URLSearchParams();
    for (const [key, raw] of Object.entries(searchParams)) {
      if (["status", "offset", "sort", "direction"].includes(key)) continue;
      for (const item of Array.isArray(raw) ? raw : raw ? [raw] : []) {
        params.append(key, item);
      }
    }
    if (value !== "under_review") params.set("status", value);
    const query = params.toString();
    return query ? `?${query}` : "?";
  }

  return (
    <nav
      aria-label="Estado de las compras"
      className="flex shrink-0 gap-1 overflow-x-auto border-b [&::-webkit-scrollbar]:hidden"
    >
      {CREDIT_PURCHASE_STATUSES.map((value) => {
        const isActive = value === status;
        const count = counts[value];
        return (
          <Link
            key={value}
            href={hrefFor(value)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {CREDIT_PURCHASE_STATUS_TAB_LABELS[value]}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                value === "under_review" && count > 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
