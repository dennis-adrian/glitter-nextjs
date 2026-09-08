"use client";

import {
  AlertCircleIcon,
  CheckIcon,
  ClockIcon,
  CircleXIcon,
  MinusIcon,
  PieChartIcon,
} from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  getCoverageLabel,
  type CoverageState,
} from "@/app/lib/payments/coverage";
import type { InvoiceTender } from "@/app/lib/payments/tender";
import { cn } from "@/app/lib/utils";

const STYLES: Record<CoverageState, string> = {
  unpaid:
    "bg-gray-500/15 border border-gray-300 text-gray-800 dark:text-gray-200",
  partial:
    "bg-amber-500/15 border border-amber-300 text-amber-800 dark:text-amber-200",
  under_review:
    "bg-blue-500/15 border border-blue-300 text-blue-800 dark:text-blue-200",
  overdue: "bg-red-500/15 border border-red-300 text-red-800 dark:text-red-200",
  paid: "bg-green-500/15 border border-green-300 text-green-800 dark:text-green-200",
  cancelled:
    "bg-gray-500/15 border border-gray-300 text-gray-600 dark:text-gray-400",
};

const ICONS: Record<CoverageState, typeof MinusIcon> = {
  unpaid: MinusIcon,
  partial: PieChartIcon,
  under_review: ClockIcon,
  overdue: AlertCircleIcon,
  paid: CheckIcon,
  cancelled: CircleXIcon,
};

const BAR_FILL: Record<CoverageState, string> = {
  unpaid: "bg-gray-400",
  partial: "bg-amber-500",
  under_review: "bg-blue-500",
  overdue: "bg-red-500",
  paid: "bg-green-500",
  cancelled: "bg-gray-400",
};

function money(amount: number): string {
  return `Bs${amount.toLocaleString("es-BO", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The parts of the bill that have actually been tendered, in the order an
 * admin asks about them: what is confirmed, then what is merely claimed.
 */
function breakdown(tender: InvoiceTender): string[] {
  const parts: string[] = [];
  if (tender.confirmedCreditAmount > 0) {
    parts.push(`${money(tender.confirmedCreditAmount)} créditos`);
  }
  if (tender.approvedCashAmount > 0) {
    parts.push(`${money(tender.approvedCashAmount)} QR`);
  }
  if (tender.submittedCashAmount > 0) {
    parts.push(`${money(tender.submittedCashAmount)} QR en revisión`);
  }
  return parts;
}

type CoverageCellProps = {
  state: CoverageState;
  tender: InvoiceTender;
  dueAt?: Date | string | null;
  /** Hides the bar and split, for dense contexts like a drawer header. */
  compact?: boolean;
};

/**
 * What is owed and what has covered it.
 *
 * Replaces the two divergent payment-status columns — one showing the raw
 * invoice status, one a six-value display status the other did not have — with
 * a single reading that can express credits and cash at the same time.
 */
export default function CoverageCell({
  state,
  tender,
  dueAt,
  compact = false,
}: CoverageCellProps) {
  const Icon = ICONS[state];
  const label = getCoverageLabel(state);
  const parts = breakdown(tender);
  const ratio =
    tender.totalAmount > 0
      ? Math.min(1, tender.coveredAmount / tender.totalAmount)
      : state === "paid"
        ? 1
        : 0;

  const badge = (
    <Badge
      className={cn("flex w-fit items-center gap-1 font-normal", STYLES[state])}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </Badge>
  );

  if (compact) return badge;

  return (
    <div className="flex min-w-40 flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums">
          {money(tender.totalAmount)}
        </span>
        {badge}
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${money(tender.coveredAmount)} de ${money(
                tender.totalAmount,
              )} cubierto`}
            >
              <div
                className={cn("h-full rounded-full", BAR_FILL[state])}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-0.5 text-xs">
              <span>Total {money(tender.totalAmount)}</span>
              <span>Cubierto {money(tender.coveredAmount)}</span>
              <span>Saldo {money(tender.outstandingAmount)}</span>
              {dueAt && state === "overdue" && (
                <span>Venció el {formatDateWithTime(new Date(dueAt))}</span>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {parts.length > 0 ? (
        <span className="text-xs text-muted-foreground">
          {parts.join(" · ")}
        </span>
      ) : (
        state === "overdue" &&
        dueAt && (
          <span className="text-xs text-red-700 dark:text-red-300">
            Venció el {formatDateWithTime(new Date(dueAt))}
          </span>
        )
      )}
    </div>
  );
}
