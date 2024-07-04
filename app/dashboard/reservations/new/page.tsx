import { fetchActiveFestival } from "@/app/data/festivals/actions";
import { fetchStandsByFestivalId, StandBase } from "@/app/api/stands/actions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { CreateReservationForm } from "@/app/components/reservations/create-form";
import Breadcrumbs from "@/app/components/ui/breadcrumbs";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import { getParticipantsOptions } from "@/app/api/reservations/helpers";
import { notFound } from "next/navigation";

export default async function Page() {
  const festival = await fetchActiveFestival({ acceptedUsersOnly: true });
  if (!festival) notFound();

  const stands = await fetchStandsByFestivalId(festival?.id);
  const artists = festival?.userRequests.map((r) => r.user) || [];
  const filteredArtists = artists.filter((artist) => {
    return isProfileInFestival(festival!.id, artist);
  });
  const options: SearchOption[] = getParticipantsOptions(filteredArtists);

  return (
    <div className="max-w-screen-md px-4 md:px-6 m-auto">
      <Breadcrumbs
        breadcrumbs={[
          { label: "Reservas", href: "/dashboard/reservations" },
          {
            label: "Nueva Reserva",
            href: `/dashboard/reservations/new`,
            active: true,
          },
        ]}
      />
      <h1 className="mb-2 text-3xl font-bold">Nueva Reserva</h1>

      <CreateReservationForm
        artists={artists}
        artistsOptions={options}
        festival={festival!}
        stands={stands}
      />
    </div>
  );
}
