import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import {
  getInfractionStatusLabel,
  infractionSeverityLabel,
} from "@/app/lib/infractions/mappers";
import type { InfractionStatus } from "@/app/lib/infractions/definitions";
import { cn } from "@/app/lib/utils";
import {
  BanIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  type LucideIcon,
} from "lucide-react";
import type { infractionSeverityEnum } from "@/db/schema";

export function getStatusBadgePresentation(status: InfractionStatus): {
  variant: BadgeVariant;
  Icon: LucideIcon;
  className?: string;
} {
  switch (status) {
    case "resolved":
      return { variant: "dark", Icon: CheckCircleIcon };
    case "under_review":
      return { variant: "secondary", Icon: EyeIcon };
    case "voided":
      return {
        variant: "outline",
        Icon: BanIcon,
        className: "text-muted-foreground",
      };
    case "pending":
    default:
      return { variant: "outline", Icon: ClockIcon };
  }
}

export function InfractionStatusBadge({
  status,
  className,
}: {
  status: InfractionStatus;
  className?: string;
}) {
  const presentation = getStatusBadgePresentation(status);
  const Icon = presentation.Icon;

  return (
    <Badge
      className={cn(
        "text-xs font-normal min-w-fit",
        presentation.className,
        className,
      )}
      variant={presentation.variant}
    >
      <Icon className="w-3.5 h-3.5 mr-1" />
      {getInfractionStatusLabel(status)}
    </Badge>
  );
}

export function InfractionSeverityBadge({
  severity,
}: {
  severity: (typeof infractionSeverityEnum.enumValues)[number];
}) {
  return (
    <Badge variant="outline" className="text-xs font-normal">
      <span className="sr-only">Severidad: </span>
      {infractionSeverityLabel[severity]}
    </Badge>
  );
}
