import { fetchConfirmedReservationsByFestival } from "@/app/api/reservations/actions";
import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { UpcomingFestivalCard } from "@/app/components/organisms/upcoming-festival";
import { Card, CardHeader, CardTitle } from "@/app/components/ui/card";
import { profileHasConfirmedReservation } from "@/app/helpers/next_event";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

export default async function Page() {
  const activeFestival = await getActiveFestival();
  const currentProfile = await getCurrentUserProfile();
  let confirmedReservations: ReservationWithParticipantsAndUsersAndStand[] = [];

  if (!currentProfile) {
    notFound();
  }

  let isProfileInActiveFestival = false;

  if (activeFestival) {
    isProfileInActiveFestival = profileHasConfirmedReservation(
      currentProfile,
      activeFestival.id,
    );
    confirmedReservations = await fetchConfirmedReservationsByFestival(
      activeFestival.id,
    );
  }

  return (
    <div className="container p-3 md:p-6">
      <h1 className="text-2xl font-bold">Tus Participaciones</h1>
      <div className="my-4 w-full">
        {isProfileInActiveFestival && activeFestival ? (
          <UpcomingFestivalCard
            festival={activeFestival}
            profile={currentProfile}
            reservation={confirmedReservations.find((reservation) =>
              reservation.participants.some(
                (participant) => participant.user.id === currentProfile.id,
              ),
            )}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Festival de Música</CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
