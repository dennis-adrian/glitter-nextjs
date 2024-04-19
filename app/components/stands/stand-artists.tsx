import AvatarGroup from "@/app/components/ui/avatar-group";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import Link from "next/link";
import { RedirectButton } from "@/app/components/redirect-button";

type Props = {
  stand: StandWithReservationsWithParticipants;
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
    }));

    cardBody = <AvatarGroup avatarsInfo={avatarsInfo} />;
    const profileButtons = participants.map((participant) => (
      <RedirectButton
        key={participant.id}
        className="p-0"
        href={`/profiles/${participant.userId}`}
        variant="link"
        size="inline"
      >
        {participant.user.displayName}
      </RedirectButton>
    ));

    label = profileButtons[0];

    if (profileButtons.length > 1) {
      label = (
        <span>
          {profileButtons[0]} & {profileButtons[1]}
        </span>
      );
    }
  }

  return (
    <div className="flex flex-col items-center text-center gap-2">
      {cardBody}
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
};

export default StandArtists;
