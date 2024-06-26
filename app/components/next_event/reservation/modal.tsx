"use client";

import { useMediaQuery } from "@/app/hooks/use-media-query";

import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import ReservationForm from "@/app/components/next_event/reservation/form";
import { Button } from "@/app/components/ui/button";
import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { FestivalBase } from "@/app/data/festivals/definitions";

export function ReservationModal({
  artists,
  open,
  profile,
  stand,
  festival,
  onOpenChange,
  onClose,
}: {
  artists: BaseProfile[];
  open: boolean;
  profile?: ProfileType | null;
  stand: StandWithReservationsWithParticipants | null;
  festival: FestivalBase;
  onClose: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (!stand || !profile) {
    return null;
  }

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={onOpenChange}>
      <DrawerDialogContent isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            {stand
              ? `Reservar espacio ${stand.label}${stand.standNumber}`
              : "Reservar stand"}
          </DrawerDialogTitle>
        </DrawerDialogHeader>
        <ReservationForm
          artists={artists}
          isDesktop={isDesktop}
          festival={festival}
          profile={profile}
          stand={stand}
          onModalClose={onClose}
        />
        {isDesktop ? null : (
          <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
            <DrawerDialogClose isDesktop={isDesktop}>
              <Button variant="outline">Cancelar</Button>
            </DrawerDialogClose>
          </DrawerDialogFooter>
        )}
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
