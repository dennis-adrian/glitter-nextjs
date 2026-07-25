import { Badge } from "@/app/components/ui/badge";
import type { InfractionType } from "@/app/lib/infractions/definitions";
import { infractionSeverityLabel } from "@/app/lib/infractions/mappers";

export default function InfractionTypeDescription({
  type,
}: {
  type?: Pick<InfractionType, "label" | "description" | "severity" | "active">;
}) {
  if (!type?.description) return null;

  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{type.label}</span>
        <Badge variant="outline">
          {infractionSeverityLabel[type.severity]}
        </Badge>
        {!type.active && <Badge variant="secondary">Archivado</Badge>}
      </div>
      <p className="whitespace-pre-wrap text-muted-foreground">
        {type.description}
      </p>
    </div>
  );
}
