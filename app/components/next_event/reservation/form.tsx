"use client";

import { useState } from "react";

import confetti from "canvas-confetti";

import { BaseProfile, ProfileType } from "@/app/api/users/definitions";

import AvatarGroup from "@/app/components/ui/avatar-group";
import { Button } from "@/app/components/ui/button";
import SearchInput from "@/app/components/ui/search-input/input";
import {
  NewStandReservation,
  createReservation,
} from "@/app/api/user_requests/actions";
import { toast } from "sonner";
import { Separator } from "@/app/components/ui/separator";
import { Label } from "@/app/components/ui/label";
import { useRouter } from "next/navigation";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { getParticipantsOptions } from "@/app/api/reservations/helpers";
import { FestivalBase } from "@/app/data/festivals/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { useForm } from "react-hook-form";
import { Form } from "@/app/components/ui/form";

type Profile = Omit<
  ProfileType,
  "userSocials" | "userRequests" | "participations"
>;
export default function ReservationForm({
  artists,
  festival,
  isDesktop,
  profile,
  stand,
  onModalClose,
}: {
  artists: BaseProfile[];
  festival: FestivalBase;
  isDesktop: boolean;
  profile: ProfileType;
  stand: StandWithReservationsWithParticipants;
  onModalClose: () => void;
}) {
  const router = useRouter();
  const searchOptions = getParticipantsOptions(artists);
  const [selectedArtist, setSelectedArtist] = useState<Profile | undefined>();
  const [addPartner, setAddPartner] = useState(false);
  const form = useForm();

  function handleSelectArtist(artistId: number) {
    const foundArtist = artists.find((artist) => artist.id === artistId);
    setSelectedArtist(foundArtist);
  }

  const avatarsInfo = [
    {
      key: profile.id,
      src: profile.imageUrl || "/img/profile-avatar.png",
      alt: "imagen de usuario",
    },
  ];

  if (selectedArtist) {
    avatarsInfo.push({
      key: selectedArtist.id,
      src: selectedArtist.imageUrl || "/img/profile-avatar.png",
      alt: "imagen de usuario",
    });
  }

  const action: () => void = form.handleSubmit(async () => {
    const participantIds = [profile.id, selectedArtist?.id].filter(
      Boolean,
    ) as number[];

    const reservation = {
      standId: stand.id,
      festivalId: festival.id,
      participantIds,
    } as NewStandReservation;

    const res = await createReservation(reservation, stand.price, profile);
    if (res.success) {
      onModalClose();
      setSelectedArtist(undefined);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
      toast.success(res.message);
      router.push(
        `/profiles/${profile.id}/festivals/${festival.id}/reservations/${res.reservationId}/payments`,
      );
    } else {
      toast.error(res.message, {
        description: res.description,
      });
    }
  });

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

      {(stand.standCategory === "illustration" ||
        stand.standCategory === "new_artist") && (
        <div className="grid items-start gap-2">
          {addPartner ? (
            <>
              <Label htmlFor="search-input">Elige a tu compañero</Label>
              <SearchInput
                id="search-input"
                options={searchOptions}
                placeholder="Ingresa el nombre..."
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
        </div>
      )}
      <Form {...form}>
        <form onSubmit={action}>
          <SubmitButton
            className="mt-4"
            disabled={form.formState.isSubmitting}
            label="Reservar espacio"
            loading={form.formState.isSubmitting}
          />
        </form>
      </Form>
    </div>
  );
}
