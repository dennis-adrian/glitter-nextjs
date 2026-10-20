import { fetchReservationForAdmin } from "@/app/lib/reservations/queries";
import EditReservationForm from "@/app/components/reservations/edit-form";
import FullTableDowngradeButton from "@/app/components/reservations/full-table-downgrade-button";
import { fullTableDowngradeDisabledReason } from "@/app/components/reservations/full-table-downgrade-options";
import FullTableUpgradeButton from "@/app/components/reservations/full-table-upgrade-button";
import {
  describeFullTableUpgradeCard,
  fullTableUpgradeDisabledReason,
} from "@/app/components/reservations/full-table-upgrade-options";
import StandChangeControl from "@/app/components/reservations/stand-change-control";
import { standChangeDisabledReason } from "@/app/components/reservations/stand-change-options";
import { fetchStandChangeOptions } from "@/app/lib/reservations/stand-change-queries";
import { fetchFullTableUpgradePreview } from "@/app/lib/reservations/full-table-upgrade-queries";
import { fetchFullTableDowngradeBlocker } from "@/app/lib/reservations/full-table-downgrade-queries";
import { summarizeReservationStands } from "@/app/lib/reservations/member-stands";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import ResourceNotFound from "@/app/components/resource-not-found";
import { getParticipantsOptions } from "@/app/api/reservations/helpers";
import { ProfileWithParticipationsAndRequests } from "@/app/api/users/definitions";
import { fetchFestival } from "@/app/lib/festivals/queries";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const reservation = await fetchReservationForAdmin(parseInt(id));
  if (!reservation) return <ResourceNotFound />;

  const festival = await fetchFestival({
    acceptedUsersOnly: true,
    id: reservation.festivalId,
  });
  const participants = festival!.userRequests.map((request) => request.user);
  const uniqueIds = [...new Set(participants.map((artist) => artist.id))];
  const uniqueParticipants = uniqueIds.map((id) =>
    participants.find((participant) => participant.id === id),
  );
  const options: SearchOption[] = getParticipantsOptions(
    uniqueParticipants as ProfileWithParticipationsAndRequests[],
  );

  // Read the aggregate: an admin looking at a full table must see both stands,
  // plus any half a manual downgrade released (PRD §13).
  const standSummary = summarizeReservationStands(
    reservation.members.map((member) => ({
      id: member.standId,
      label: member.stand.label,
      standNumber: member.stand.standNumber,
      standCategory: member.stand.standCategory,
      releasedAt: member.releasedAt,
      position: member.position,
    })),
  );

  // The downgrade is the sanctioned resolution for a full table whose credits
  // were reversed (PRD §7.7), so it belongs on the reservation it corrects.
  // Only a global admin may run it; a festival admin sees it inert rather than
  // missing, so the action reads as restricted instead of unimplemented.
  const actor = await getCurrentUserProfile();
  const isGlobalAdmin = canMutateAdminReservations(actor);
  const [keptStand, releasedStand] = standSummary.active;

  // The picker lists every stand in the festival, occupied ones included:
  // choosing one of those is how an admin reaches the exchange. A full table
  // has no single half to widen, so its upgrade preview is not even asked for;
  // a half has nothing to reduce, so neither is the downgrade's money check.
  const [standChangeOptions, upgradePreview, downgradeBlocker] =
    await Promise.all([
      fetchStandChangeOptions(reservation.festivalId),
      standSummary.isFullTable
        ? Promise.resolve(null)
        : fetchFullTableUpgradePreview(reservation.id),
      standSummary.isFullTable && isGlobalAdmin
        ? fetchFullTableDowngradeBlocker(reservation.id)
        : Promise.resolve(null),
    ]);
  const liveMembers = reservation.members.filter(
    (member) => member.releasedAt == null,
  );
  const standChangeBlockedReason = standChangeDisabledReason({
    isGlobalAdmin,
    liveMemberCount: liveMembers.length,
    reservationStatus: reservation.status,
  });
  // Offered only where a stand really is half of a declared table; a stand
  // outside any table lacks the concept altogether. Every other blocker keeps
  // the control on the page, disabled with its reason.
  const showUpgrade =
    !standSummary.isFullTable && upgradePreview?.inFullTableGroup === true;
  const upgradeBlockedReason =
    showUpgrade && upgradePreview
      ? fullTableUpgradeDisabledReason({
          isGlobalAdmin,
          reservationStatus: reservation.status,
          liveMemberCount: liveMembers.length,
          preview: upgradePreview,
        })
      : null;
  // Disabled with its reason when the service would refuse for money, rather
  // than letting the admin confirm into the refusal toast.
  const downgradeBlockedReason = fullTableDowngradeDisabledReason({
    isGlobalAdmin,
    moneyBlocker: downgradeBlocker?.moneyBlocker ?? null,
  });
  // The money rule only binds a table priced as a table; one from before table
  // pricing downgrades whatever its cobro holds, so the copy only states the
  // rule where it applies.
  const tablePriced = reservation.fullTablePriceSnapshot != null;
  const upgradeDescription = upgradePreview
    ? describeFullTableUpgradeCard({
        preview: upgradePreview,
        disabledReason: upgradeBlockedReason,
      })
    : null;

  const statusLabel =
    {
      pending: "Pendiente",
      verification_payment: "Verificación de pago",
      accepted: "Aceptada",
      rejected: "Rechazada",
      cancelled: "Cancelada",
      released: "Liberada",
    }[reservation.status] ?? reservation.status;

  return (
    <div className="m-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/festivals/${reservation.festivalId}/reservations`}
            >
              Reservas
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Editar Reserva</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* The stand is what this page is about, so it is the heading. Burying it
          in a card title left the page titled "Editar Reserva" — true of every
          reservation, and identifying of none. */}
      <header className="mt-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">
            {standSummary.isFullTable ? "Espacios" : "Espacio"}{" "}
            {standSummary.label}
          </h1>
          <Badge variant="secondary">{statusLabel}</Badge>
          {standSummary.isFullTable ? <Badge>Mesa completa</Badge> : null}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Reserva #{reservation.id} · {standSummary.dimensions}
          {standSummary.released.length > 0
            ? ` · Liberado por reducción a media mesa: ${standSummary.released
                .map((member) => `${member.label ?? ""}${member.standNumber}`)
                .join(", ")}`
            : null}
        </p>
      </header>

      {/* One card level. Each section is a sibling on the page background —
          nesting them inside a page-wide card made every heading look like a
          sub-heading of something else. */}
      <div className="space-y-6">
        {/* Keyed by status: the form seeds its fields once, and the stand
            switch and the full-table upgrade can reopen the reservation to
            `pending` behind it. Without a remount the select would keep
            offering the old status after the refresh. */}
        <EditReservationForm
          key={`${reservation.id}:${reservation.status}`}
          artists={uniqueParticipants as ProfileWithParticipationsAndRequests[]}
          artistsOptions={options}
          reservation={reservation}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Espacio</CardTitle>
            <CardDescription>
              Mové la reserva a otro espacio, incluso a otro sector o con otro
              precio. Si el espacio elegido ya está ocupado, las dos reservas
              intercambian lugares y te lo vamos a decir antes de hacerlo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StandChangeControl
              reservationId={reservation.id}
              currentStandId={liveMembers[0]?.standId ?? 0}
              currentStandLabel={
                liveMembers[0] ? formatStandLabel(liveMembers[0].stand) : "—"
              }
              options={standChangeOptions}
              disabledReason={standChangeBlockedReason}
            />
          </CardContent>
        </Card>

        {showUpgrade && upgradePreview ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mesa completa</CardTitle>
              <CardDescription>{upgradeDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <FullTableUpgradeButton
                reservationId={reservation.id}
                preview={upgradePreview}
                disabledReason={upgradeBlockedReason}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* Isolated because it hands a stand back to the map, where somebody
            else can take it before anyone changes their mind. */}
        {standSummary.isFullTable && keptStand && releasedStand ? (
          <Card className="bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-lg">Zona de riesgo</CardTitle>
              <CardDescription>
                Esta reserva ocupa los dos espacios de una mesa. Si los créditos
                que la pagaron fueron revertidos, podés dejarla con el espacio
                que el participante eligió primero y devolver el otro al mapa
                {tablePriced
                  ? ", siempre que el cobro no tenga pagos ni créditos aplicados."
                  : "."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FullTableDowngradeButton
                reservationId={reservation.id}
                keptStandLabel={formatStandLabel(keptStand)}
                releasedStandLabel={formatStandLabel(releasedStand)}
                disabledReason={downgradeBlockedReason ?? undefined}
                tablePriced={tablePriced}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
