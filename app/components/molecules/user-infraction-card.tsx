import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";
import { formatDate } from "@/app/lib/formatters";
import {
  getInfractionStatusLabel,
  infractionSeverityLabel,
} from "@/app/lib/infractions/mappers";
import type { InfractionStatus } from "@/app/lib/infractions/definitions";
import type { ParticipantInfraction } from "@/app/lib/infractions/participant-queries";
import { cn } from "@/app/lib/utils";
import {
  AlertCircleIcon,
  BanIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  type LucideIcon,
} from "lucide-react";
import { DateTime } from "luxon";

function getStatusBadgePresentation(status: InfractionStatus): {
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

export default function UserInfractionCard({
  infraction,
}: {
  infraction: ParticipantInfraction;
}) {
  let iconColor = "";
  switch (infraction.type.severity) {
    case "low":
      iconColor = "text-blue-700";
      break;
    case "medium":
      iconColor = "text-yellow-700";
      break;
    case "high":
      iconColor = "text-orange-700";
      break;
    case "critical":
      iconColor = "text-red-700";
      break;
  }

  let iconBgColor = "";
  switch (infraction.type.severity) {
    case "low":
      iconBgColor = "bg-blue-500/10";
      break;
    case "medium":
      iconBgColor = "bg-yellow-500/10";
      break;
    case "high":
      iconBgColor = "bg-orange-500/10";
      break;
    case "critical":
      iconBgColor = "bg-red-500/10";
      break;
  }

  const statusBadge = getStatusBadgePresentation(infraction.status);
  const StatusIcon = statusBadge.Icon;

  return (
    <div
      id={`infraction-${infraction.id}`}
      className="bg-card p-4 rounded-md shadow-md border flex items-start gap-2 scroll-mt-20"
    >
      <div className={cn("p-2 rounded-lg", iconBgColor)}>
        <AlertCircleIcon className={cn("w-5 h-5", iconColor)} />
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="font-medium text-sm">{infraction.type.label}</span>
        <div className="flex flex-wrap gap-1">
          <Badge
            className={cn(
              "text-xs font-normal min-w-fit",
              statusBadge.className,
            )}
            variant={statusBadge.variant}
          >
            <StatusIcon className="w-4 h-4 mr-1" />
            {getInfractionStatusLabel(infraction.status)}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal">
            {infractionSeverityLabel[infraction.type.severity]}
          </Badge>
        </div>
        {infraction.type.description && (
          <span className="text-sm text-muted-foreground">
            {infraction.type.description}
          </span>
        )}
        {infraction.description && (
          <span className="text-sm whitespace-pre-wrap">
            {infraction.description}
          </span>
        )}
        <Separator className="my-1" />
        <span className="text-xs text-muted-foreground">
          Registrada el{" "}
          {formatDate(infraction.createdAt).toLocaleString(DateTime.DATE_MED)}
        </span>
        <span className="text-xs text-muted-foreground">
          {infraction.festival?.name ?? "Ámbito global"}
        </span>
        {infraction.sanctionId != null && (
          <a
            href={`#sanction-${infraction.sanctionId}`}
            className="text-xs text-primary hover:underline"
          >
            Ver sanción #{infraction.sanctionId}
          </a>
        )}
      </div>
    </div>
  );
}
