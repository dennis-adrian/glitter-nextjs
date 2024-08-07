import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { RedirectButton } from "@/app/components/redirect-button";
import { ProfileType } from "@/app/api/users/definitions";
import ProfileAvatarGroup from "@/app/components/common/profile-avatar-group";

type Props = {
  participants?: ProfileType[];
};

const StandArtists = ({ participants }: Props) => {
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
    cardBody = <ProfileAvatarGroup profiles={participants} />;
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

  return (
    <div className="flex flex-col items-center text-center gap-2">
      {cardBody}
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
};

export default StandArtists;
