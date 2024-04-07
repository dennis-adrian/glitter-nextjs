import { fetchActiveFestival } from "@/app/data/festivals/actions";
import { fetchReservation } from "@/app/api/reservations/actions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import EditReservationForm from "@/app/components/reservations/edit-form";
import Breadcrumbs from "@/app/components/ui/breadcrumbs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { SearchOption } from "@/app/components/ui/search-input/search-content";

export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;
  const reservation = await fetchReservation(parseInt(id));
  const festival = await fetchActiveFestival({
    acceptedUsersOnly: true,
  });
  const festivalArtists = festival!.userRequests.map((request) => request.user);
  const filteredArtists = festivalArtists.filter((artist) => {
    return isProfileInFestival(festival!.id, artist);
  });
  const options: SearchOption[] = filteredArtists.map((artist) => ({
    displayName: artist.displayName || "",
    id: artist.id,
  }));

  return (
    <div className="max-w-screen-md px-4 md:px-6 m-auto">
      <Breadcrumbs
        breadcrumbs={[
          { label: "Reservas", href: "/dashboard/reservations" },
          {
            label: "Editar Reserva",
            href: `/dashboard/reservations/${id}/edit`,
            active: true,
          },
        ]}
      />
      <h1 className="mb-2 text-3xl font-bold">Editar Reserva</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            Espacio{" "}
            {`${reservation?.stand.label}${reservation?.stand.standNumber}`}
          </CardTitle>
          <CardDescription>
            Puedes agregar o eliminar participantes de la reserva
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditReservationForm
            artists={filteredArtists}
            artistsOptions={options}
            reservation={reservation!}
          />
        </CardContent>
      </Card>
    </div>
  );
}
