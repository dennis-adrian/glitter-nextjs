import {
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  LucideIcon,
  Minus,
} from "lucide-react";

import { Badge, BadgeVariant } from "@/app/components/ui/badge";
import { InfractionType } from "@/app/lib/infractions/definitions";
import { infractionSeverityLabel } from "@/app/lib/infractions/mappers";

export function InfractionSeverityBadge({
  severity,
}: {
  severity: InfractionType["severity"];
}) {
  const severityMap: Record<InfractionType["severity"], BadgeVariant> = {
    low: "green",
    medium: "amber",
    high: "red",
    critical: "red",
  };

  const severityIconMap: Record<InfractionType["severity"], LucideIcon> = {
    low: ChevronDown,
    medium: Minus,
    high: ChevronUp,
    critical: ChevronsUp,
  };

  const SeverityIcon = severityIconMap[severity];

  return (
    <Badge variant={severityMap[severity]}>
      <SeverityIcon className="w-3.5 h-3.5 mr-1" />
      {infractionSeverityLabel[severity]}
    </Badge>
  );
}
