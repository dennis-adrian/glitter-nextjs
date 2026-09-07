import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { RedirectButton } from "@/app/components/redirect-button";
import { ProfileType } from "@/app/api/users/definitions";
import ProfileAvatarGroup from "@/app/components/common/profile-avatar-group";
import {
  StandBase,
  StandWithReservationsWithParticipants,
} from "@/app/api/stands/definitions";
import { getStandMapParticipants } from "@/app/components/maps/map-participants";
import { Badge } from "@/app/components/ui/badge";

type Props = {
  festivalId: number;
  participants?: ProfileType[];
  stand: StandBase | StandWithReservationsWithParticipants;
};

const StandArtists = ({ festivalId, participants, stand }: Props) => {
  let cardBody;
  let label;
  const externalParticipants =
    "reservations" in stand
      ? getStandMapParticipants(stand).filter(
          (participant) => participant.kind === "external",
        )
      : [];

  if (!participants?.length && externalParticipants.length === 0) {
    cardBody = (
      <Avatar>
        <AvatarImage src="/img/profile-avatar.png" alt="Espacio Disponible" />
      </Avatar>
    );
    label = "Espacio disponible";
  }

  if (participants?.length && participants.length > 0) {
    cardBody = (
      <ProfileAvatarGroup
        festivalId={festivalId}
        profiles={participants}
        stand={stand}
      />
    );
    const profileButtons = participants.map((participant) => (
      <RedirectButton
        key={participant.id}
        className="p-0"
        href={`/public_profiles/${participant.id}`}
        variant="link"
        size="inline"
      >
        {participant.displayName}
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

  if (!participants?.length && externalParticipants.length > 0) {
    cardBody = (
      <div className="flex -space-x-2">
        {externalParticipants.slice(0, 2).map((participant) => (
          <Avatar key={participant.id} className="border-2 border-background">
            <AvatarImage
              src={participant.imageUrl ?? "/img/profile-avatar.png"}
              alt={participant.displayName}
            />
          </Avatar>
        ))}
      </div>
    );
    label = (
      <span className="flex flex-col items-center gap-1">
        <span>
          {externalParticipants
            .map((participant) => participant.displayName)
            .join(" & ")}
        </span>
        <Badge
          variant="outline"
          className="rounded-full border-teal-600 text-teal-700"
        >
          {externalParticipants[0].categoryLabel}
        </Badge>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center text-center gap-2">
      {cardBody}
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
};

export default StandArtists;
