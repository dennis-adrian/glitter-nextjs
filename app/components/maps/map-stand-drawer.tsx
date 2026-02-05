"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { ProfileType } from "@/app/api/users/definitions";
import { StandStatusBadge } from "@/app/components/stands/status-badge";
import StandArtists from "@/app/components/stands/stand-artists";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/app/components/ui/drawer";

type MapStandDrawerProps = {
  stand: StandWithReservationsWithParticipants | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canBeReserved: boolean;
  participantProfiles: ProfileType[];
};

export default function MapStandDrawer({
  stand,
  open,
  onOpenChange,
  canBeReserved,
  participantProfiles,
}: MapStandDrawerProps) {
  if (!stand) return null;

  const { label, standNumber, status } = stand;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            Espacio {label}
            {standNumber}
          </DrawerTitle>
          {(canBeReserved || status !== "available") && (
            <StandStatusBadge status={status} />
          )}
        </DrawerHeader>
        <div className="px-4 pb-6">
          {status === "disabled" ? (
            <p className="text-sm text-muted-foreground text-center">
              Espacio deshabilitado
            </p>
          ) : (canBeReserved || status !== "available") &&
            stand.festivalId != null ? (
            <StandArtists
              festivalId={stand.festivalId}
              participants={participantProfiles}
              stand={stand}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              No puedes reservar en este espacio
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
