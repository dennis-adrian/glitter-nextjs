"use client";

import { useState } from "react";

import confetti from "canvas-confetti";

import { Stand } from "@/app/api/stands/actions";
import { ProfileType } from "@/app/api/users/definitions";

import AvatarGroup from "@/app/components/ui/avatar-group";
import { Button } from "@/app/components/ui/button";
import SearchInput from "@/app/components/ui/search-input/input";
import { getSearchArtistOptions } from "@/app/helpers/next_event";
import {
  NewStandReservation,
  createReservation,
} from "@/app/api/user_requests/actions";
import { toast } from "sonner";
import { Separator } from "@/app/components/ui/separator";
import { Label } from "@/app/components/ui/label";

type Profile = Omit<
  ProfileType,
  "userSocials" | "userRequests" | "participations"
>;
export default function ReservationForm({
  isDesktop,
  profile,
  stand,
  onModalClose,
}: {
  isDesktop: boolean;
  profile: ProfileType;
  stand: Stand;
  onModalClose: () => void;
}) {
  const searchOptions = getSearchArtistOptions(stand.festival, profile);
  const [selectedArtist, setSelectedArtist] = useState<Profile | undefined>();
  const [addPartner, setAddPartner] = useState(false);

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

  async function handleConfirm() {
    const participantIds = [profile.id, selectedArtist?.id].filter(
      Boolean,
    ) as number[];

    const reservation = {
      standId: stand.id,
      festivalId: stand.festival.id,
      participantIds,
    } as NewStandReservation;

    const res = await createReservation(reservation);
    if (res.success) {
      onModalClose();
      setSelectedArtist(undefined);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
      toast.success("Reserva confirmada");
    } else {
      toast.error("No se pudo confirmar la reserva", {
        description: "Inténtalo de nuevo",
      });
    }
  }

  return (
    <div className={`${isDesktop ? "" : "px-4"}`}>
      <h1 className="mb-4">Reservando para:</h1>
      <div className="flex flex-col items-center mb-4">
        <AvatarGroup avatarsInfo={avatarsInfo} />
        <span className="text-sm text-muted-foreground mt-2">
          {selectedArtist
            ? `${profile.displayName} & ${selectedArtist.displayName}`
            : profile.displayName}
        </span>
      </div>

      <div className="grid items-start gap-2">
        {addPartner ? (
          <>
            <Label htmlFor="search-input">Busca a tu compañero</Label>
            <SearchInput
              id="search-input"
              options={searchOptions}
              placeholder="Ingresa un nombre de artista..."
              onSelect={handleSelectArtist}
            />
          </>
        ) : (
          <>
            <Separator />
            <div className="flex items-center mb-2 mt-6 sm:mb-0 sm:mt-4">
              <span>¿Compartes espacio?</span>
              <Button variant="link" onClick={() => setAddPartner(true)}>
                ¡Haz click aquí!
              </Button>
            </div>
          </>
        )}
        <Button className="mt-4" type="submit" onClick={handleConfirm}>
          Confirmar reserva
        </Button>
      </div>
    </div>
  );
}
