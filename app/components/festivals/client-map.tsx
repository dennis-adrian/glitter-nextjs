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
import { FestivalMapVersion } from "@/app/data/festivals/definitions";
import {
  StandWithReservationsWithParticipants,
  StandZone,
} from "@/app/api/stands/definitions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";

export default function ClientMap({
  artists,
  profile,
  stands,
  category,
  mapVersion,
  zone,
}: {
  artists: BaseProfile[];
  profile: ProfileType | null;
  stands: StandWithReservationsWithParticipants[];
  category: Exclude<UserCategory, "none">;
  mapVersion: FestivalMapVersion;
  zone: StandZone;
}) {
  const [openModal, setOpenModal] = useState(false);
  const [selectedStand, setSelectedStand] =
    useState<StandWithReservationsWithParticipants | null>(null);

  function handleStandClick(stand: StandWithReservationsWithParticipants) {
    if (!profile) return;

    if (profile.role !== "admin") {
      const inFestival = isProfileInFestival(stand.festivalId, profile);
      if (!inFestival || profile.category !== category) return;
      if (profileHasReservation(profile, stand.festivalId)) return;
    }

    setSelectedStand(stand);
    setOpenModal(true);
  }

  function handleModalClose() {
    setSelectedStand(null);
    setOpenModal(false);
  }

  const imageSrc = imagesSrc[mapVersion][category][zone]!.sm;

  return (
    <>
      <MapImage
        mapSrc={imageSrc}
        stands={stands}
        onStandClick={handleStandClick}
      />
      <ReservationModal
        artists={artists}
        profile={profile}
        open={openModal}
        stand={selectedStand}
        onOpenChange={setOpenModal}
        onClose={handleModalClose}
      />
    </>
  );
}
