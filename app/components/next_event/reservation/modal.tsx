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
import { Stand } from "@/app/api/stands/actions";
import ReservationForm from "@/app/components/next_event/reservation/form";
import { Button } from "@/app/components/ui/button";

export function ReservationModal({
  open,
  stand,
  onOpenChange,
}: {
  open: boolean;
  stand: Stand | null;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (!stand) {
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
        <div className={`${isDesktop ? "" : "px-4"}`}>
          <ReservationForm stand={stand} />
        </div>
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
