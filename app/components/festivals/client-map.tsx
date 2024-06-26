"use client";

import { useState } from "react";

import {
  BaseProfile,
  ProfileType,
  UserCategory,
} from "@/app/api/users/definitions";
import MapImage from "@/app/components/festivals/map-image";
import { ReservationModal } from "@/app/components/next_event/reservation/modal";
import { profileHasReservation } from "@/app/helpers/next_event";
import { imagesSrc } from "@/app/lib/maps/config";
import {
  FestivalBase,
  FestivalMapVersion,
} from "@/app/data/festivals/definitions";
import {
  StandWithReservationsWithParticipants,
  StandZone,
} from "@/app/api/stands/definitions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";

export default function ClientMap({
  artists,
  festival,
  imageSrc,
  profile,
  stands,
}: {
  artists: BaseProfile[];
  imageSrc?: string | null;
  festival: FestivalBase;
  profile: ProfileType | null;
  stands: StandWithReservationsWithParticipants[];
}) {
  const [openModal, setOpenModal] = useState(false);
  const [selectedStand, setSelectedStand] =
    useState<StandWithReservationsWithParticipants | null>(null);

  if (!imageSrc) return null;

  function handleStandClick(stand: StandWithReservationsWithParticipants) {
    if (!profile) return;

    if (profile.role !== "admin") {
      const inFestival = isProfileInFestival(festival.id, profile);
      if (!inFestival || profile.category !== stand.standCategory) return;
      if (profileHasReservation(profile, festival.id)) return;
    }

    setSelectedStand(stand);
    setOpenModal(true);
  }

  function handleModalClose() {
    setSelectedStand(null);
    setOpenModal(false);
  }

  return (
    <>
      <MapImage
        mapSrc={imageSrc}
        stands={stands}
        forReservation
        profile={profile}
        onStandClick={handleStandClick}
      />
      <ReservationModal
        artists={artists}
        profile={profile}
        open={openModal}
        stand={selectedStand}
        festival={festival}
        onOpenChange={setOpenModal}
        onClose={handleModalClose}
      />
    </>
  );
}
