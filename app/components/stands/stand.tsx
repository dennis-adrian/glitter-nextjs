import { CSSProperties } from "react";

import { Stand } from "@/app/api/stands/actions";
import { StandPosition } from "@/app/api/stands/definitions";
import { getStandSize } from "@/app/components/next_event/helpers";

export function StandShape({
  imageSize,
  position,
  proportions,
  stand,
}: {
  imageSize: { width: number; height: number };
  position: { left: number; top: number };
  proportions: { wide: number; narrow: number };
  stand: Stand;
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
    bgColor += "bg-fuchsia-600 hover:bg-fuchsia-800";
  } else {
    bgColor += "hover:bg-amber-100 hover:bg-opacity-60";
  }

  return (
    <div
      className={`${bgColor} bg-opacity-50`}
      key={`${label}${standNumber}`}
      style={style}
    ></div>
  );
}
