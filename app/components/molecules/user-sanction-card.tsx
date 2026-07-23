import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";
import { formatDate } from "@/app/lib/formatters";
import type { ParticipantSanction } from "@/app/lib/infractions/participant-queries";
import {
  formatSanctionValidity,
  getParticipantSanctionConsequence,
  sanctionFestivalScopeLabel,
  sanctionStatusLabel,
  sanctionTypeLabel,
} from "@/app/lib/sanctions/mappers";
import { DateTime } from "luxon";
import { ScaleIcon } from "lucide-react";

export default function UserSanctionCard({
  sanction,
}: {
  sanction: ParticipantSanction;
}) {
  const upcomingEligibility = sanction.festivals
    .filter(
      (item) =>
        item.reservationEligibleAt &&
        item.reservationEligibleAt.getTime() > Date.now(),
    )
    .sort(
      (a, b) =>
        a.reservationEligibleAt!.getTime() - b.reservationEligibleAt!.getTime(),
    )[0];

  return (
    <div
      id={`sanction-${sanction.id}`}
      className="bg-card p-4 rounded-md shadow-md border space-y-2 scroll-mt-20"
    >
      <div className="flex items-start gap-2">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <ScaleIcon className="w-5 h-5 text-amber-800" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-sm">
            {sanctionTypeLabel[sanction.type]}
          </p>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-xs font-normal">
              {sanctionStatusLabel[sanction.status]}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal">
              {sanctionFestivalScopeLabel[sanction.festivalScope]}
            </Badge>
          </div>
        </div>
      </div>

      {sanction.description && (
        <p className="text-sm whitespace-pre-wrap">{sanction.description}</p>
      )}

      <p className="rounded-md bg-muted/50 p-3 text-sm">
        {getParticipantSanctionConsequence({
          type: sanction.type,
          status: sanction.status,
        })}
      </p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Validez</dt>
        <dd>
          {formatSanctionValidity({
            validityDuration: sanction.validityDuration,
            validityUnit: sanction.validityUnit,
          })}
        </dd>
        <dt className="text-muted-foreground">Inicio</dt>
        <dd>
          {formatDate(sanction.startsAt).toLocaleString(DateTime.DATETIME_MED)}
        </dd>
        <dt className="text-muted-foreground">Fin</dt>
        <dd>
          {sanction.endsAt
            ? formatDate(sanction.endsAt).toLocaleString(DateTime.DATETIME_MED)
            : "—"}
        </dd>
        {sanction.type === "reservation_delay" &&
          sanction.reservationDelayMinutes != null && (
            <>
              <dt className="text-muted-foreground">Retraso</dt>
              <dd>{sanction.reservationDelayMinutes} minutos</dd>
            </>
          )}
        {sanction.remainingFestivals != null && (
          <>
            <dt className="text-muted-foreground">Festivales</dt>
            <dd>
              {sanction.countedFestivals} contados ·{" "}
              {sanction.remainingFestivals} restantes
            </dd>
          </>
        )}
      </dl>

      {upcomingEligibility?.reservationEligibleAt && (
        <p className="text-sm">
          <span className="text-muted-foreground">
            Próxima elegibilidad de reserva ({upcomingEligibility.festivalName}
            ):{" "}
          </span>
          {formatDate(upcomingEligibility.reservationEligibleAt).toLocaleString(
            DateTime.DATETIME_MED,
          )}
        </p>
      )}

      {sanction.revocationReason && (
        <p className="text-sm">
          <span className="text-muted-foreground">Revocación: </span>
          {sanction.revocationReason}
        </p>
      )}

      <Separator />

      {sanction.infractionIds.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Infracciones:</span>
          {sanction.infractionIds.map((infractionId) => (
            <a
              key={infractionId}
              href={`#infraction-${infractionId}`}
              className="text-primary hover:underline"
            >
              #{infractionId}
            </a>
          ))}
        </div>
      )}

      {sanction.festivals.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Festivales calificados
          </p>
          <ul className="space-y-1 text-xs">
            {sanction.festivals.map((item) => (
              <li key={item.festivalId}>
                {item.festivalName}
                {item.reservationEligibleAt
                  ? ` · elegible ${formatDate(item.reservationEligibleAt).toLocaleString(DateTime.DATETIME_MED)}`
                  : ""}
                {item.countedAt
                  ? " · contado"
                  : item.countsTowardDuration
                    ? " · pendiente de conteo"
                    : " · excluido"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
