"use client";
import { useState } from "react";

import { Stand } from "@/app/api/stands/actions";
import { ProfileType } from "@/app/api/users/definitions";
import MapImage from "@/app/components/festivals/map-image";
import { ReservationModal } from "@/app/components/next_event/reservation/modal";

export default function ClientMap({
  profile,
  stands,
}: {
  profile: ProfileType | null;
  stands: Stand[];
}) {
  const [openModal, setOpenModal] = useState(false);
  const [selectedStand, setSelectedStand] = useState<Stand | null>(null);

  function handleStandClick(stand: Stand) {
    if (!profile) return;

    if (profile.role !== "admin") {
      // const inFestival = isProfileInFestival(stand.festivalId, profile);
      // if (!inFestival) return;
      // if (profileHasReservation(profile, stand.festivalId)) return;
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
