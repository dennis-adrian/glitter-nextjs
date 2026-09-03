import { fetchReservationForAdmin } from "@/app/lib/reservations/queries";
import EditReservationForm from "@/app/components/reservations/edit-form";
import { summarizeReservationStands } from "@/app/lib/reservations/member-stands";
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
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import ResourceNotFound from "@/app/components/resource-not-found";
import { getParticipantsOptions } from "@/app/api/reservations/helpers";
import { ProfileWithParticipationsAndRequests } from "@/app/api/users/definitions";
import { fetchFestival } from "@/app/lib/festivals/actions";

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

  return (
    <div className="max-w-3xl px-4 md:px-6 m-auto">
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
      <h1 className="my-2 text-3xl font-bold">Editar Reserva</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            {standSummary.isFullTable ? "Espacios" : "Espacio"}{" "}
            {standSummary.label}
            {standSummary.isFullTable ? " (mesa completa)" : null}
          </CardTitle>
          <CardDescription>
            {standSummary.dimensions}
            {standSummary.released.length > 0
              ? ` · Liberado por reducción a media mesa: ${standSummary.released
                  .map((member) => `${member.label ?? ""}${member.standNumber}`)
                  .join(", ")}`
              : null}
            . Puedes agregar o eliminar al acompañante de la reserva.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditReservationForm
            artists={
              uniqueParticipants as ProfileWithParticipationsAndRequests[]
            }
            artistsOptions={options}
            reservation={reservation}
          />
        </CardContent>
      </Card>
    </div>
  );
}
