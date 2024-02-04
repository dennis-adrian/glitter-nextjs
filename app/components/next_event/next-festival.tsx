"use client";

import { Stand } from "@/app/api/stands/actions";
import { Map } from "@/app/components/next_event/map";
import { ReservationModal } from "@/app/components/next_event/modal";
import { useState } from "react";

export default function NextFestival({ stands }: { stands: Stand[] }) {
  const [openModal, setOpenModal] = useState(false);
  const [selectedStand, setSelectedStand] = useState<Stand | null>(null);

  function handleStandClick(stand: Stand) {
    setSelectedStand(stand);
    setOpenModal(true);
  }

  return (
    <>
      <Map stands={stands} onStandClick={handleStandClick} />
      <ReservationModal open={openModal} onOpenChange={setOpenModal} />
    </>
  );
}
