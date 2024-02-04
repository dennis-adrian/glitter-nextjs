"use client";

import { Stand } from "@/app/api/stands/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { Map } from "@/app/components/next_event/map";
import { ReservationModal } from "@/app/components/next_event/reservation/modal";
import { useState } from "react";

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

    const inFestival = isProfileInFestival(stand.festivalId, profile);
    if (!inFestival && profile.role !== "admin") return;

    setSelectedStand(stand);
    setOpenModal(true);
  }

  function handleModalClose() {
    setSelectedStand(null);
    setOpenModal(false);
  }

  return (
    <>
      <Map stands={stands} onStandClick={handleStandClick} />
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
