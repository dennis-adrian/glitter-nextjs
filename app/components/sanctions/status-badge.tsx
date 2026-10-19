import type { SanctionStatus } from "@/app/lib/sanctions/definitions";
import { sanctionStatusLabel } from "@/app/lib/sanctions/mappers";
import { cn } from "@/app/lib/utils";

const STATUS_CLASS: Record<SanctionStatus, string> = {
  scheduled: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  active:
    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  expired: "bg-muted text-foreground",
  revoked: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
};

export function SanctionStatusBadge({ status }: { status: SanctionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        STATUS_CLASS[status],
      )}
    >
      {sanctionStatusLabel[status]}
    </span>
  );
}
