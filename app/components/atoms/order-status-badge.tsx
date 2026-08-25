import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  CogIcon,
  CreditCardIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "../ui/badge";
import StatusDot, { type StatusTone } from "@/app/components/atoms/status-dot";
import { OrderStatus } from "@/app/lib/orders/definitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";

type StatusPresentation = {
  tone: StatusTone;
  icon: LucideIcon;
  /** Pill colours, kept next to the tone so the two appearances can't drift. */
  pill: string;
};

const STATUS_PRESENTATION: Record<OrderStatus, StatusPresentation> = {
  pending: {
    tone: "neutral",
    icon: ClockIcon,
    pill: "text-gray-500 border-gray-200 bg-gray-50",
  },
  payment_verification: {
    tone: "info",
    icon: CogIcon,
    pill: "text-blue-600 border-blue-200 bg-blue-50",
  },
  processing: {
    tone: "info",
    icon: CogIcon,
    pill: "text-blue-600 border-blue-200 bg-blue-50",
  },
  paid: {
    tone: "warning",
    icon: CreditCardIcon,
    pill: "text-amber-700 border-amber-200 bg-amber-50",
  },
  delivered: {
    tone: "success",
    icon: CheckCircleIcon,
    pill: "text-green-700 border-green-200 bg-green-50",
  },
  cancelled: {
    tone: "danger",
    icon: AlertCircleIcon,
    pill: "text-red-600 border-red-200 bg-red-50",
  },
};

const UNKNOWN_PRESENTATION: StatusPresentation = {
  tone: "neutral",
  icon: ClockIcon,
  pill: "",
};

type OrderStatusBadgeProps = {
  status: OrderStatus;
  /**
   * `dot` for lists, where the status repeats on every row; `pill` for detail
   * screens, where it is the headline fact rather than a column to scan.
   */
  appearance?: "pill" | "dot";
};

export default function OrderStatusBadge({
  status,
  appearance = "pill",
}: OrderStatusBadgeProps) {
  const statusLabel = getOrderStatusLabel(status);
  const presentation = STATUS_PRESENTATION[status] ?? UNKNOWN_PRESENTATION;

  if (appearance === "dot") {
    return <StatusDot tone={presentation.tone} label={statusLabel} />;
  }

  const Icon = presentation.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${presentation.pill}`}>
      <Icon className="h-3 w-3" />
      {statusLabel}
    </Badge>
  );
}
