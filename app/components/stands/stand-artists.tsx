import { Stand } from "@/app/api/stands/actions";
import AvatarGroup from "@/app/components/ui/avatar-group";
import { Avatar, AvatarImage } from "@/components/ui/avatar";

type Props = {
  stand: Stand;
};
const StandArtists = ({ stand }: Props) => {
  const participants = stand.reservations?.find(
    (reservation) =>
      reservation.status === "pending" || reservation.status === "accepted",
  )?.participants;

  let cardBody;
  let label;
  if (!participants?.length) {
    cardBody = (
      <Avatar>
        <AvatarImage src="/img/profile-avatar.png" alt="Espacio Disponible" />
      </Avatar>
    );
    label = "Espacio disponible";
  }

  if (participants?.length && participants.length > 0) {
    const avatarsInfo = participants.map(({ user: artist }) => ({
      key: artist.id,
      src: artist.imageUrl || "/img/profile-avatar.png",
      alt: "imagen de usuario",
      fallback: `${artist.firstName}${artist.lastName}`,
    }));

    cardBody = (
      <div className="flex flex-col items-center mb-4">
        <AvatarGroup avatarsInfo={avatarsInfo} />
        <span className="text-sm text-muted-foreground mt-2">
          {participants.length > 1
            ? `${participants[0].user.displayName} & ${participants[1].user.displayName}`
            : participants[0].user.displayName}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      {cardBody}
      <span className="mt-2 text-sm text-muted-foreground">{label}</span>
    </div>
  );
};

export default StandArtists;
