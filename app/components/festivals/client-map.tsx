"use client";

import { useState } from "react";

import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { ReservationModal } from "@/app/components/next_event/reservation/modal";
import { ReservationDrawer } from "@/app/components/next_event/reservation/drawer";
import { profileHasReservation } from "@/app/helpers/next_event";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import UserMap from "@/app/components/maps/user/user-map";

export default function ClientMap({
  artists,
  festival,
  profile,
  stands,
}: {
  artists: BaseProfile[];
  festival: FestivalBase;
  profile: ProfileType | null;
  stands: StandWithReservationsWithParticipants[];
}) {
  const [openModal, setOpenModal] = useState(false);
  const [selectedStand, setSelectedStand] =
    useState<StandWithReservationsWithParticipants | null>(null);

  const [openDrawer, setOpenDrawer] = useState(false);
  const [touchSelectedStand, setTouchSelectedStand] =
    useState<StandWithReservationsWithParticipants | null>(null);

  function canReserve(stand: StandWithReservationsWithParticipants): boolean {
    if (!profile) return false;
    if (stand.status !== "available") return false;

    if (profile.role !== "admin") {
      const inFestival = isProfileInFestival(festival.id, profile);
      if (!inFestival || profile.category !== stand.standCategory) return false;
      if (profileHasReservation(profile, festival.id)) return false;
    }

    return true;
  }

  function handleStandClick(stand: StandWithReservationsWithParticipants) {
    if (!canReserve(stand)) return;

    setSelectedStand(stand);
    setOpenModal(true);
  }

  function handleStandTouchTap(stand: StandWithReservationsWithParticipants): boolean {
    if (!canReserve(stand)) return false;

    setTouchSelectedStand(stand);
    setOpenDrawer(true);
    return true;
  }

  function handleModalClose() {
    setSelectedStand(null);
    setOpenModal(false);
  }

  function handleDrawerClose() {
    setTouchSelectedStand(null);
    setOpenDrawer(false);
  }

  return (
    <>
      <UserMap
        stands={stands}
        forReservation
        profile={profile}
        onStandClick={handleStandClick}
        onStandTouchTap={handleStandTouchTap}
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
      <ReservationDrawer
        artists={artists}
        profile={profile}
        open={openDrawer}
        stand={touchSelectedStand}
        festival={festival}
        onOpenChange={setOpenDrawer}
        onClose={handleDrawerClose}
      />
    </>
  );
}
