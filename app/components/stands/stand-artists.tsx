import { Stand } from "@/app/api/stands/actions";
import { Avatar, AvatarImage } from "@/components/ui/avatar";

type Props = {
  stand: Stand;
};
const StandArtists = ({ stand }: Props) => {
  const artists = stand.reservations?.find(
    (reservation) =>
      reservation.status === "pending" || reservation.status === "accepted",
  )?.participations;

  let cardBody;
  let label;
  if (!artists?.length) {
    cardBody = (
      <Avatar>
        <AvatarImage src="/img/profile-avatar.png" alt="Espacio Disponible" />
      </Avatar>
    );
    label = "Espacio disponible";
  } else if (artists.length === 1) {
    cardBody = (
      <Avatar>
        <AvatarImage
          src={artists[0]!.user!.imageUrl!}
          alt={artists[0]!.user!.displayName!}
        />
      </Avatar>
    );
    label = artists[0]!.user.displayName;
  } else {
    cardBody = (
      <div className="-space-x-6 rtl:space-x-reverse">
        {artists.map((artist) => (
          <Avatar key={artist.user.id}>
            <AvatarImage
              src={artist!.user!.imageUrl!}
              alt={artist!.user!.displayName!}
            />
          </Avatar>
        ))}
      </div>
    );
    label = artists.map((artist) => artist!.user.displayName).join(" & ");
  }

  return (
    <div className="flex flex-col items-center text-center">
      {cardBody}
      <span className="mt-2 text-sm text-muted-foreground">{label}</span>
    </div>
  );
};

export default StandArtists;
