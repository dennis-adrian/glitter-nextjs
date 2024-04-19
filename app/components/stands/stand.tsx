import { CSSProperties } from "react";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

import { getStandSize } from "@/app/components/next_event/helpers";
import { ProfileType } from "@/app/api/users/definitions";
import {
  standsPositions,
  standProportions,
} from "@/app/components/next_event/config";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { StandStatusBadge } from "@/app/components/stands/status-badge";
import StandArtists from "@/app/components/stands/stand-artists";

export function StandShape({
  imageSize,
  stand,
  onClick,
}: {
  imageSize: { width: number; height: number };
  profile?: ProfileType | null;
  stand: StandWithReservationsWithParticipants;
  onClick: (stand: StandWithReservationsWithParticipants) => void;
}) {
  const positionLeft =
    stand.positionLeft ||
    standsPositions.find((position) => position.id === stand.standNumber)
      ?.left ||
    0;
  const positionTop =
    stand.positionTop ||
    standsPositions.find((position) => position.id === stand.standNumber)
      ?.top ||
    0;
  const widht = stand.width || standProportions.wide || 0;
  const height = stand.height || standProportions.narrow || 0;
  const { orientation, standNumber, status } = stand;
  const size = getStandSize(imageSize, { wide: widht, narrow: height });

  const style: CSSProperties = {
    position: "absolute",
    left: `${positionLeft}%`,
    top: `${positionTop}%`,
    cursor: `${status === "available" ? "pointer" : "not-allowed"}`,
    height: `${orientation === "landscape" ? size.narrow : size.wide}px`,
    width: `${orientation === "landscape" ? size.wide : size.narrow}px`,
  };

  let bgColor = "hover:bg-opacity-60 ";
  if (status === "reserved") {
    bgColor += "bg-emerald-200 hover:bg-emerald-400";
  } else if (status === "confirmed") {
    bgColor += "bg-rose-600 hover:bg-rose-700";
  } else if (status === "disabled") {
    bgColor += "bg-zinc-800";
  } else {
    bgColor += "hover:bg-amber-100 hover:bg-opacity-60";
  }

  const handleClick = () => {
    if (stand.status !== "available") return;
    onClick(stand);
  };

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div
          className={`${bgColor} bg-opacity-50`}
          style={style}
          onClick={handleClick}
        />
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex flex-col gap-6 min-w-40">
          <div>
            <h1 className="font-semibold">
              Espacio {stand.label}
              {standNumber}
            </h1>
            <StandStatusBadge status={status} />
          </div>
          {status !== "disabled" && <StandArtists stand={stand} />}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
