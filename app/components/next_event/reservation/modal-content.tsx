import { Stand } from "@/app/api/stands/actions";
import { ProfileType } from "@/app/api/users/definitions";
import ReservationForm from "@/app/components/next_event/reservation/form";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar";
import AvatarGroup from "@/app/components/ui/avatar-group";
import { useState } from "react";

type Profile = Omit<ProfileType, "userSocials" | "userRequests">;

export function ReservationModalContent({
  isDesktop,
  profile,
  stand,
}: {
  isDesktop: boolean;
  profile: ProfileType;
  stand: Stand;
}) {
  const [selectedArtist, setSelectedArtist] = useState<Profile | undefined>();
  function handleSelectArtist(artistId: number) {
    const requests = stand.festival.userRequests;
    const artists = requests.map(({ user }) => user);
    const foundArtist = artists.find((artist) => artist.id === artistId);
    setSelectedArtist(foundArtist);
  }

  const avatarsInfo = [
    {
      key: profile.id,
      src: profile.imageUrl || "/img/profile-avatar.png",
      alt: "imagen de usuario",
      fallback: `${profile.firstName}${profile.lastName}`,
    },
  ];

  if (selectedArtist) {
    avatarsInfo.push({
      key: selectedArtist.id,
      src: selectedArtist.imageUrl || "/img/profile-avatar.png",
      alt: "imagen de usuario",
      fallback: `${selectedArtist.firstName}${selectedArtist.lastName}`,
    });
  }

  return (
    <div className={`${isDesktop ? "" : "px-4"}`}>
      <div className="flex flex-col items-center">
        <AvatarGroup avatarsInfo={avatarsInfo} />
        <span className="text-sm text-muted-foreground mt-2">
          {selectedArtist
            ? `${profile.displayName} & ${selectedArtist.displayName}`
            : profile.displayName}
        </span>
      </div>
      <ReservationForm stand={stand} onSelectArtist={handleSelectArtist} />
    </div>
  );
}
