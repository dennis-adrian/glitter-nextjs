"use client";

import { useState } from "react";

import { Stand } from "@/app/api/stands/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";

import { Map } from "@/app/components/next_event/map";
import { ReservationModal } from "@/app/components/next_event/reservation/modal";
import { profileHasReservation } from "@/app/helpers/next_event";

export default function NextFestival({
  profile,
  stands,
}: {
  profile?: ProfileType | null;
  stands: Stand[];
}) {
  const [openModal, setOpenModal] = useState(false);
  const [selectedStand, setSelectedStand] = useState<Stand | null>(null);

  function handleStandClick(stand: Stand) {
    if (!profile) return;

    if (profile.role !== "admin") {
      const inFestival = isProfileInFestival(stand.festivalId, profile);
      if (!inFestival) return;
      if (profileHasReservation(profile, stand.festivalId)) return;
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
      <Map profile={profile} stands={stands} onStandClick={handleStandClick} />
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
