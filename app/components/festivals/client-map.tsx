"use client";

import { useState } from "react";

import { Stand } from "@/app/api/stands/actions";
import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import MapImage from "@/app/components/festivals/map-image";
import { ReservationModal } from "@/app/components/next_event/reservation/modal";
import { profileHasReservation } from "@/app/helpers/next_event";
import { imagesSrc } from "@/app/lib/maps/config";
import { FestivalMapVersion } from "@/app/data/festivals/definitions";
import { StandZone } from "@/app/api/stands/definitions";

export default function ClientMap({
  profile,
  stands,
  category,
  mapVersion,
  zone,
}: {
  profile: ProfileType | null;
  stands: Stand[];
  category: Exclude<UserCategory, "none">;
  mapVersion: FestivalMapVersion;
  zone: StandZone;
}) {
  const [openModal, setOpenModal] = useState(false);
  const [selectedStand, setSelectedStand] = useState<Stand | null>(null);

  function handleStandClick(stand: Stand) {
    if (!profile) return;

    if (profile.role !== "admin") {
      // const inFestival = isProfileInFestival(stand.festivalId, profile);
      // if (!inFestival) return;
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
        profile={profile}
        stands={stands}
        onStandClick={handleStandClick}
      />
      <ReservationModal
        profile={profile}
        open={openModal}
        stand={selectedStand}
        onOpenChange={setOpenModal}
        onClose={handleModalClose}
      />
    </>
  );
}
