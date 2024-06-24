import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { getParticipantProfilesWithStand } from "@/app/components/festivals/helpers";
import ParticipantInfo from "@/app/components/festivals/participant-info";

type ParticipantsProps = {
  stands: StandWithReservationsWithParticipants[];
};

export default function ParticipantsGrid(props: ParticipantsProps) {
  const reservations = props.stands
    .flatMap((stand) => stand.reservations)
    .filter((r) => r.status === "accepted");
  const profilesWithStand = getParticipantProfilesWithStand(
    props.stands,
    reservations,
  );

  if (profilesWithStand.length === 0) return null;

  return (
    <div className="relative flex flex-col border rounded-md max-h-[600px] lg:max-h-[1000px] overflow-x-auto flex-grow">
      <div className="sticky top-0 left-0 bg-white/90 z-10 border-b px-4">
        <h1 className="font-semibold text-xl my-4">
          Participantes Confirmados
        </h1>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 justify-center gap-2 p-4">
        {profilesWithStand.map(({ profile, stand }) => (
          <ParticipantInfo key={profile.id} profile={profile} stand={stand} />
        ))}
      </div>
    </div>
  );
}
