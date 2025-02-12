import {
  StandBase,
  StandWithReservationsWithParticipants,
} from "@/app/api/stands/definitions";
import { BaseProfile, Participation } from "@/app/api/users/definitions";
import ParticipantInfo from "@/app/components/festivals/participant-info";

type ParticipantsProps = {
  stands: StandWithReservationsWithParticipants[];
  participants: (BaseProfile & {
    stands: StandBase[];
    participations: Participation[];
  })[];
  festivalId: number;
};

export default async function ParticipantsGrid(props: ParticipantsProps) {
  const sortedParticipants = props.participants.sort((a, b) => {
    const aFirstStand = a.stands[0];
    const bFirstStand = b.stands[0];

    return aFirstStand.standNumber - bFirstStand.standNumber;
  });

  return (
    <div className="relative flex flex-col border rounded-md max-h-[600px] lg:max-h-[1000px] overflow-x-auto flex-grow">
      <div className="sticky top-0 left-0 bg-white/90 z-10 border-b px-4">
        <h1 className="font-semibold text-xl my-4">
          Participantes Confirmados
        </h1>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 justify-center gap-2 p-4">
        {sortedParticipants.map((participant) => (
          <ParticipantInfo
            key={participant.id}
            profile={participant}
            festivalId={props.festivalId}
          />
        ))}
      </div>
    </div>
  );
}
