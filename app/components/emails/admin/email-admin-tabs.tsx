import Link from "next/link";

import {
  EMAIL_ADMIN_TAB_LABELS,
  EMAIL_ADMIN_TABS,
  type EmailAdminCounts,
  type EmailAdminTab,
} from "@/app/lib/emails/admin-definitions";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { cn } from "@/lib/utils";

function countFor(tab: EmailAdminTab, counts: EmailAdminCounts) {
  if (tab === "blocked") return counts.bounced + counts.complained;
  if (tab === "unsubscribed") return counts.unsubscribed;
  return counts.lifted;
}

/**
 * The page's lists as tabs with how many each holds. Switching keeps the
 * search but goes back to the first page: page four of one list is rarely
 * page four of another.
 */
export default function EmailAdminTabs({
  tab,
  counts,
  searchParams,
}: {
  tab: EmailAdminTab;
  counts: EmailAdminCounts;
  searchParams: RawSearchParams;
}) {
  function hrefFor(value: EmailAdminTab) {
    const params = new URLSearchParams();
    const query = searchParams.query;
    if (typeof query === "string" && query) params.set("query", query);
    if (value !== "blocked") params.set("tab", value);
    const search = params.toString();
    return search ? `?${search}` : "?";
  }

  return (
    <nav
      aria-label="Listas de correos"
      className="flex shrink-0 gap-1 overflow-x-auto border-b [&::-webkit-scrollbar]:hidden"
    >
      {EMAIL_ADMIN_TABS.map((value) => {
        const isActive = value === tab;
        const count = countFor(value, counts);
        return (
          <Link
            key={value}
            href={hrefFor(value)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {EMAIL_ADMIN_TAB_LABELS[value]}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
              {count.toLocaleString("es-BO")}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
