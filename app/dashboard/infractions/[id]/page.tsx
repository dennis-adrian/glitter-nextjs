import {
  InfractionEvidencePanel,
  InfractionEventsPanel,
  InfractionNotesPanel,
} from "@/app/components/infractions/detail-panels";
import EditInfractionForm from "@/app/components/infractions/edit-form";
import InfractionStatusActions from "@/app/components/infractions/status-actions";
import {
  InfractionSeverityBadge,
  InfractionStatusBadge,
} from "@/app/components/infractions/status-badge";
import { fetchInfractionTypes } from "@/app/lib/infractions/actions";
import {
  getPriorNoticeLabel,
  participantDisplayName,
} from "@/app/lib/infractions/mappers";
import {
  fetchFestivalsForInfractionFilters,
  fetchInfractionDetail,
  fetchParticipantOtherInfractions,
} from "@/app/lib/infractions/queries";
import { formatDate } from "@/app/lib/formatters";
import { ArrowLeftIcon } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function InfractionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const infractionId = Number(id);
  if (!Number.isInteger(infractionId) || infractionId <= 0) notFound();

  const [infraction, infractionTypes, festivals] = await Promise.all([
    fetchInfractionDetail(infractionId),
    fetchInfractionTypes(),
    fetchFestivalsForInfractionFilters(),
  ]);

  if (!infraction) notFound();

  const otherInfractions = await fetchParticipantOtherInfractions({
    userId: infraction.userId,
    excludeInfractionId: infraction.id,
  });

  const sanction = infraction.sanctions[0];

  return (
    <div className="container mx-auto space-y-6 p-3 md:p-6">
      <div className="space-y-2">
        <Link
          href="/dashboard/infractions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Volver al listado
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Infracción #{infraction.id}</h1>
          <InfractionStatusBadge status={infraction.status} />
          <InfractionSeverityBadge severity={infraction.type.severity} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">Participante</h2>
          <p className="font-medium">
            {participantDisplayName(infraction.user)}
          </p>
          <p className="text-sm text-muted-foreground">
            {infraction.user.email}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href={`/dashboard/infractions?userId=${infraction.userId}&limit=25&offset=0`}
              className="text-primary hover:underline"
            >
              Historial completo
            </Link>
            <Link
              href={`/dashboard/users/${infraction.userId}`}
              className="text-primary hover:underline"
            >
              Perfil
            </Link>
          </div>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">Detalle</h2>
          <p>
            <span className="text-muted-foreground">Tipo: </span>
            {infraction.type.label}
          </p>
          <p>
            <span className="text-muted-foreground">Festival: </span>
            {infraction.festival?.name ?? "Global"}
          </p>
          <p>
            <span className="text-muted-foreground">Aviso previo: </span>
            {getPriorNoticeLabel({
              userGaveNotice: infraction.userGaveNotice,
              gaveNoticeAt: infraction.gaveNoticeAt,
            })}
            {infraction.gaveNoticeAt &&
              ` · ${formatDate(infraction.gaveNoticeAt).toLocaleString(DateTime.DATETIME_MED)}`}
          </p>
          <p>
            <span className="text-muted-foreground">Registrada: </span>
            {formatDate(infraction.createdAt).toLocaleString(
              DateTime.DATETIME_MED,
            )}
          </p>
          {infraction.description && (
            <p className="text-sm whitespace-pre-wrap">
              {infraction.description}
            </p>
          )}
          {infraction.resolutionNotes && (
            <p className="text-sm">
              <span className="text-muted-foreground">Resolución: </span>
              {infraction.resolutionNotes}
            </p>
          )}
          {infraction.voidReason && (
            <p className="text-sm">
              <span className="text-muted-foreground">Anulación: </span>
              {infraction.voidReason}
            </p>
          )}
          {sanction && (
            <p className="text-sm">
              <span className="text-muted-foreground">Sanción: </span>#
              {sanction.id} · {sanction.type}
              {sanction.active ? "" : " (inactiva)"}
            </p>
          )}
        </section>
      </div>

      <InfractionStatusActions
        infractionId={infraction.id}
        status={infraction.status}
      />

      <EditInfractionForm
        infraction={infraction}
        infractionTypes={infractionTypes}
        festivals={festivals.map((festival) => ({
          id: festival.id,
          name: festival.name,
        }))}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <InfractionNotesPanel infraction={infraction} />
        <InfractionEvidencePanel infraction={infraction} />
      </div>

      <InfractionEventsPanel events={infraction.events} />

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium text-sm">
          Otras infracciones del participante
        </h2>
        {otherInfractions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay otras</p>
        ) : (
          <ul className="space-y-2">
            {otherInfractions.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/dashboard/infractions/${item.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  #{item.id} · {item.type.label} · {item.status} ·{" "}
                  {item.festival?.name ?? "Global"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
