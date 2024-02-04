import { CSSProperties } from "react";

import { Stand } from "@/app/api/stands/actions";
import { getStandSize } from "@/app/components/next_event/helpers";
import StandContent from "@/app/components/stands/stand-content";
import { ProfileType } from "@/app/api/users/definitions";

export function StandShape({
  imageSize,
  position,
  profile,
  proportions,
  stand,
  onClick,
}: {
  imageSize: { width: number; height: number };
  position: { left: number; top: number };
  profile?: ProfileType | null;
  proportions: { wide: number; narrow: number };
  stand: Stand;
  onClick: (stand: Stand) => void;
}) {
  const { orientation, label, standNumber, status } = stand;
  const size = getStandSize(imageSize, proportions);

  const style: CSSProperties = {
    position: "absolute",
    left: `${position.left}%`,
    top: `${position.top}%`,
    cursor: "pointer",
    height: `${orientation === "landscape" ? size.narrow : size.wide}px`,
    width: `${orientation === "landscape" ? size.wide : size.narrow}px`,
  };

  let bgColor = "hover:bg-opacity-60 ";
  if (status === "reserved") {
    bgColor += "bg-emerald-200 hover:bg-emerald-400";
  } else if (status === "confirmed") {
    bgColor += "bg-rose-600 hover:bg-rose-700";
  } else {
    bgColor += "hover:bg-amber-100 hover:bg-opacity-60";
  }

  const handleClick = () => {
    if (stand.status !== "available") return;
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
        standPosition={{ top: position.top || 0, left: position.left || 0 }}
      />
    </div>
  );
}
