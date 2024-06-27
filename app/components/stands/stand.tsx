import { CSSProperties } from "react";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

import { getStandSize } from "@/app/components/next_event/helpers";
import {
  standsPositions,
  standProportions,
} from "@/app/components/next_event/config";
import StandContent from "@/app/components/stands/stand-content";

export function StandShape({
  canBeReserved = true,
  imageSize,
  stand,
  onClick,
}: {
  canBeReserved?: boolean;
  imageSize: { width: number; height: number };
  stand: StandWithReservationsWithParticipants;
  onClick?: (stand: StandWithReservationsWithParticipants) => void;
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
  const width = stand.width || standProportions.wide || 0;
  const height = stand.height || standProportions.narrow || 0;
  const { orientation, standNumber, status } = stand;
  const size = getStandSize(imageSize, { wide: width, narrow: height });

  const style: CSSProperties = {
    position: "absolute",
    left: `${positionLeft}%`,
    top: `${positionTop}%`,
    cursor: `${canBeReserved ? "pointer" : "not-allowed"}`,
    height: `${orientation === "landscape" ? size.narrow : size.wide}px`,
    width: `${orientation === "landscape" ? size.wide : size.narrow}px`,
  };

  let bgColor = "hover:bg-opacity-60 ";
  if (status === "reserved") {
    bgColor += "bg-emerald-200 hover:bg-emerald-400";
  } else if (status === "confirmed") {
    bgColor += "bg-rose-600 hover:bg-rose-700";
  } else if (status === "disabled" || !canBeReserved) {
    bgColor += "bg-zinc-800";
  } else {
    bgColor += "hover:bg-amber-100 hover:bg-opacity-60";
  }

  const handleClick = () => {
    if (!canBeReserved || !onClick) return;
    onClick(stand);
  };

  return (
    <div
      className={`${bgColor} bg-opacity-50`}
      key={standNumber}
      style={style}
      onClick={handleClick}
    >
      <StandContent
        canBeReserved={canBeReserved}
        stand={stand}
        standPosition={{ top: positionTop || 0, left: positionLeft || 0 }}
      />
    </div>
  );
}
