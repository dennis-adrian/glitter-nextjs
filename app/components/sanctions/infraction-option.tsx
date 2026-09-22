import {
  InfractionSeverityBadge,
  InfractionStatusBadge,
} from "@/app/components/infractions/status-badge";
import { formatDisplayDate } from "@/app/lib/formatters";
import type { EligibleInfractionOption } from "@/app/lib/sanctions/queries";
import { DateTime } from "luxon";

type InfractionOptionData = Pick<
  EligibleInfractionOption,
  "id" | "status" | "createdAt" | "type" | "festival"
>;

export default function SanctionInfractionOption({
  infraction,
}: {
  infraction: InfractionOptionData;
}) {
  return (
    <div className="space-y-1">
      <p className="font-medium">
        #{infraction.id} · {infraction.type.label}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <InfractionStatusBadge status={infraction.status} />
        <InfractionSeverityBadge severity={infraction.type.severity} />
        <span className="text-xs text-muted-foreground">
          {infraction.festival?.name ?? "Global"} ·{" "}
          {formatDisplayDate(infraction.createdAt, DateTime.DATE_MED)}
        </span>
      </div>
    </div>
  );
}
