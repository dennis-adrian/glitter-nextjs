import { CSSProperties } from "react";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

import { getStandSize } from "@/app/components/next_event/helpers";
import { ProfileType } from "@/app/api/users/definitions";
import {
  standsPositions,
  standProportions,
} from "@/app/components/next_event/config";
import StandContent from "@/app/components/stands/stand-content";

export function StandShape({
  imageSize,
  stand,
  onClick,
}: {
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
  const widht = stand.width || standProportions.wide || 0;
  const height = stand.height || standProportions.narrow || 0;
  const { orientation, standNumber, status } = stand;
  const size = getStandSize(imageSize, { wide: widht, narrow: height });

  const style: CSSProperties = {
    position: "absolute",
    left: `${positionLeft}%`,
    top: `${positionTop}%`,
    cursor: `${status === "available" && onClick ? "pointer" : "not-allowed"}`,
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
    if (stand.status !== "available" || !onClick) return;
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
        stand={stand}
        standPosition={{ top: positionTop || 0, left: positionLeft || 0 }}
      />
    </div>
  );
}
