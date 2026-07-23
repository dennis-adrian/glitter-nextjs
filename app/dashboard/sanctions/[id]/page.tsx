import EditSanctionForm from "@/app/components/sanctions/edit-form";
import FestivalCountingAction from "@/app/components/sanctions/festival-counting-action";
import RevokeSanctionActions from "@/app/components/sanctions/revoke-actions";
import { SanctionStatusBadge } from "@/app/components/sanctions/status-badge";
import {
  InfractionSeverityBadge,
  InfractionStatusBadge,
} from "@/app/components/infractions/status-badge";
import { formatDate } from "@/app/lib/formatters";
import { participantDisplayName } from "@/app/lib/infractions/mappers";
import {
  formatSanctionValidity,
  sanctionEventTypeLabel,
  sanctionFestivalScopeLabel,
  sanctionStatusLabel,
  sanctionTypeLabel,
} from "@/app/lib/sanctions/mappers";
import { fetchSanctionDetail } from "@/app/lib/sanctions/queries";
import { ArrowLeftIcon } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { notFound } from "next/navigation";

const auditFieldLabel: Record<string, string> = {
  type: "Tipo",
  festivalScope: "Alcance",
  validityUnit: "Unidad de validez",
  validityDuration: "Duración de validez",
  validity: "Validez",
  startsAt: "Inicio",
  endsAt: "Fin",
  reservationDelayMinutes: "Retraso de reserva",
  infractionIds: "Infracciones",
  infractions: "Infracciones",
  description: "Descripción",
  added: "Agregadas",
  removed: "Quitadas",
  unit: "Unidad",
  duration: "Duración",
  festivalId: "Festival",
  countsTowardDuration: "Cuenta para la duración",
  previousExcludedReason: "Motivo de exclusión anterior",
  from: "Anterior",
  to: "Nuevo",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatAuditValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.map((item) => `#${item}`).join(", ");
  if (isRecord(value)) {
    return Object.entries(value)
      .map(
        ([key, nestedValue]) =>
          `${auditFieldLabel[key] ?? key}: ${formatAuditValue(nestedValue)}`,
      )
      .join(" · ");
  }
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}

function describeAuditChanges(changes: unknown) {
  if (!isRecord(changes)) return [];

  return Object.entries(changes).map(([key, value]) => {
    if (isRecord(value) && ("from" in value || "to" in value)) {
      return {
        label: auditFieldLabel[key] ?? key,
        value: `${formatAuditValue(value.from)} → ${formatAuditValue(value.to)}`,
      };
    }

    return {
      label: auditFieldLabel[key] ?? key,
      value: formatAuditValue(value),
    };
  });
}

export default async function SanctionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sanctionId = Number(id);
  if (!Number.isInteger(sanctionId) || sanctionId <= 0) notFound();

  const sanction = await fetchSanctionDetail(sanctionId);
  if (!sanction) notFound();

  return (
    <div className="container mx-auto space-y-6 p-3 md:p-6">
      <div className="space-y-2">
        <Link
          href={`/dashboard/infractions?userId=${sanction.userId}&limit=25&offset=0`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Historial del participante
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Sanción #{sanction.id}</h1>
          <SanctionStatusBadge status={sanction.status} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">Participante</h2>
          <p className="font-medium">{participantDisplayName(sanction.user)}</p>
          <p className="text-sm text-muted-foreground">{sanction.user.email}</p>
          <Link
            href={`/dashboard/users/${sanction.userId}`}
            className="text-sm text-primary hover:underline"
          >
            Ver perfil
          </Link>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">Configuración</h2>
          <p>
            <span className="text-muted-foreground">Tipo: </span>
            {sanctionTypeLabel[sanction.type]}
          </p>
          <p>
            <span className="text-muted-foreground">Alcance: </span>
            {sanctionFestivalScopeLabel[sanction.festivalScope]}
          </p>
          <p>
            <span className="text-muted-foreground">Validez: </span>
            {formatSanctionValidity({
              validityDuration: sanction.validityDuration,
              validityUnit: sanction.validityUnit,
            })}
          </p>
          <p>
            <span className="text-muted-foreground">Inicio: </span>
            {formatDate(sanction.startsAt).toLocaleString(
              DateTime.DATETIME_MED,
            )}
          </p>
          <p>
            <span className="text-muted-foreground">Fin: </span>
            {sanction.endsAt
              ? formatDate(sanction.endsAt).toLocaleString(
                  DateTime.DATETIME_MED,
                )
              : "—"}
          </p>
          {sanction.type === "reservation_delay" && (
            <p>
              <span className="text-muted-foreground">
                Retraso de reserva:{" "}
              </span>
              {sanction.reservationDelayMinutes} minutos
            </p>
          )}
          {sanction.description && (
            <p className="text-sm whitespace-pre-wrap">
              {sanction.description}
            </p>
          )}
          {sanction.revocationReason && (
            <p className="text-sm">
              <span className="text-muted-foreground">Revocación: </span>
              {sanction.revocationReason}
            </p>
          )}
          <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            <p>
              Creada el{" "}
              {formatDate(sanction.createdAt).toLocaleString(
                DateTime.DATETIME_MED,
              )}
              {sanction.createdBy
                ? ` por ${participantDisplayName(sanction.createdBy)}`
                : ""}
            </p>
            <p>
              Aprobada el{" "}
              {formatDate(sanction.approvedAt).toLocaleString(
                DateTime.DATETIME_MED,
              )}
              {sanction.approvedBy
                ? ` por ${participantDisplayName(sanction.approvedBy)}`
                : ""}
            </p>
            {sanction.revokedAt && (
              <p>
                Revocada el{" "}
                {formatDate(sanction.revokedAt).toLocaleString(
                  DateTime.DATETIME_MED,
                )}
                {sanction.revokedBy
                  ? ` por ${participantDisplayName(sanction.revokedBy)}`
                  : ""}
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">Infracciones vinculadas</h2>
        {sanction.sanctionInfractions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin infracciones</p>
        ) : (
          <ul className="space-y-2">
            {sanction.sanctionInfractions.map((link) => (
              <li
                key={link.infractionId}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <Link
                  href={`/dashboard/infractions/${link.infraction.id}`}
                  className="text-primary hover:underline"
                >
                  #{link.infraction.id} · {link.infraction.type.label}
                </Link>
                <InfractionStatusBadge status={link.infraction.status} />
                <InfractionSeverityBadge
                  severity={link.infraction.type.severity}
                />
                <span className="text-muted-foreground">
                  {link.infraction.festival?.name ?? "Global"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">Festivales calificados</h2>
        {sanction.validityUnit === "festivals" && (
          <p className="text-sm text-muted-foreground">
            Contados:{" "}
            {
              sanction.sanctionFestivals.filter(
                (item) => item.countsTowardDuration && item.countedAt,
              ).length
            }{" "}
            / {sanction.validityDuration ?? "—"}
          </p>
        )}
        {sanction.sanctionFestivals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ningún festival calificado todavía
          </p>
        ) : (
          <ul className="space-y-3">
            {sanction.sanctionFestivals.map((item) => (
              <li
                key={`${item.sanctionId}-${item.festivalId}`}
                className="rounded-md border p-3 text-sm space-y-1"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/festivals/${item.festival.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {item.festival.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {item.festival.festivalType} · {item.festival.status}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  Calificado:{" "}
                  {formatDate(item.qualifiedAt).toLocaleString(
                    DateTime.DATETIME_MED,
                  )}
                </p>
                {item.reservationEligibleAt && (
                  <p className="text-muted-foreground">
                    Elegible para reservar:{" "}
                    {formatDate(item.reservationEligibleAt).toLocaleString(
                      DateTime.DATETIME_MED,
                    )}
                  </p>
                )}
                {item.festivalEndAt && (
                  <p className="text-muted-foreground">
                    Fecha final usada para el conteo:{" "}
                    {formatDate(item.festivalEndAt).toLocaleString(
                      DateTime.DATETIME_MED,
                    )}
                  </p>
                )}
                <p className="text-muted-foreground">
                  {item.countsTowardDuration
                    ? item.countedAt
                      ? `Contado el ${formatDate(item.countedAt).toLocaleString(DateTime.DATETIME_MED)}`
                      : "Pendiente de conteo"
                    : `Excluido${item.excludedReason ? `: ${item.excludedReason}` : ""}`}
                </p>
                {sanction.validityUnit === "festivals" && !item.countedAt && (
                  <FestivalCountingAction
                    sanctionId={item.sanctionId}
                    festivalId={item.festivalId}
                    countsTowardDuration={item.countsTowardDuration}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RevokeSanctionActions
        sanctionId={sanction.id}
        status={sanction.status}
      />

      <EditSanctionForm
        key={`${sanction.updatedAt.toISOString()}-${sanction.sanctionInfractions
          .map((link) => link.infractionId)
          .join("-")}`}
        sanction={sanction}
      />

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium text-sm">Historial de cambios</h2>
        {sanction.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos</p>
        ) : (
          <ul className="space-y-3">
            {sanction.events.map((event) => {
              const changes = describeAuditChanges(event.changes);
              return (
                <li
                  key={event.id}
                  className="text-sm border-b pb-3 last:border-0"
                >
                  <p className="font-medium">
                    {sanctionEventTypeLabel[event.eventType]}
                  </p>
                  <p className="text-muted-foreground">
                    {formatDate(event.createdAt).toLocaleString(
                      DateTime.DATETIME_MED,
                    )}
                    {event.actor
                      ? ` · ${participantDisplayName(event.actor)}`
                      : ""}
                  </p>
                  {(event.fromStatus || event.toStatus) && (
                    <p className="mt-1 text-xs">
                      Estado:{" "}
                      {event.fromStatus
                        ? sanctionStatusLabel[event.fromStatus]
                        : "—"}{" "}
                      →{" "}
                      {event.toStatus
                        ? sanctionStatusLabel[event.toStatus]
                        : "—"}
                    </p>
                  )}
                  {changes.length > 0 && (
                    <dl className="mt-2 space-y-1 rounded-md bg-muted/50 p-2 text-xs">
                      {changes.map((change) => (
                        <div key={change.label}>
                          <dt className="inline font-medium">
                            {change.label}:{" "}
                          </dt>
                          <dd className="inline">{change.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {event.note && <p className="mt-1">{event.note}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
