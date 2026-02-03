"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { ProfileType } from "@/app/api/users/definitions";
import { StandStatusBadge } from "@/app/components/stands/status-badge";
import StandArtists from "@/app/components/stands/stand-artists";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/app/components/ui/hover-card";

type MapTooltipProps = {
  stand: StandWithReservationsWithParticipants;
  canBeReserved: boolean;
  participantProfiles: ProfileType[];
  children: React.ReactNode;
};

export default function MapTooltip({
  stand,
  canBeReserved,
  participantProfiles,
  children,
}: MapTooltipProps) {
  const { label, standNumber, status } = stand;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="center"
        className="w-auto min-w-[180px]"
      >
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-sm font-semibold">
              Espacio {label}
              {standNumber}
            </p>
            {(canBeReserved || status !== "available") && (
              <StandStatusBadge status={status} />
            )}
          </div>
          <div>
            {status === "disabled" ? (
              <p className="text-sm text-muted-foreground text-center">
                Espacio deshabilitado
              </p>
            ) : canBeReserved || status !== "available" ? (
              <StandArtists
                festivalId={stand.festivalId!}
                participants={participantProfiles}
                stand={stand}
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                No puedes reservar en este espacio
              </p>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
