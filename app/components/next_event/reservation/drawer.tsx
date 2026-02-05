"use client";

import ReservationForm from "@/app/components/next_event/reservation/form";
import { Button } from "@/app/components/ui/button";
import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/app/components/ui/drawer";
import { FestivalBase } from "@/app/lib/festivals/definitions";

export function ReservationDrawer({
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
  if (!stand || !profile) {
    return null;
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(newOpen) => {
        onOpenChange(newOpen);
        if (!newOpen) {
          onClose();
        }
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            Reservar espacio {stand.label}{stand.standNumber}
          </DrawerTitle>
        </DrawerHeader>
        <div className="px-4">
          <ReservationForm
            artists={artists}
            isDesktop={false}
            festival={festival}
            profile={profile}
            stand={stand}
            onModalClose={onClose}
          />
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline" className="w-full">
              Cancelar
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
