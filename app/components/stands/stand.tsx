import { CSSProperties } from "react";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

import { getStandSize } from "@/app/components/next_event/helpers";
import {
  standsPositions,
  standProportions,
} from "@/app/components/next_event/config";
import StandContent from "@/app/components/stands/stand-content";
import { ProfileType } from "@/app/api/users/definitions";

export function StandShape({
  canBeReserved = true,
  imageSize,
  stand,
  participantProfiles,
  onClick,
}: {
  canBeReserved?: boolean;
  imageSize: { width: number; height: number };
  stand: StandWithReservationsWithParticipants;
  participantProfiles: ProfileType[];
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

  let bgColor = "rounded-sm ";
	if (status === "reserved") {
		bgColor += "bg-emerald-300/35 hover:bg-emerald-500/40";
	} else if (status === "confirmed") {
		bgColor += "bg-rose-500/35 hover:bg-rose-700/40";
	} else if (status === "disabled" || !canBeReserved) {
		bgColor += "bg-zinc-800/40";
	} else {
		bgColor += "hover:bg-amber-100/60";
	}

  const handleClick = () => {
    if (!canBeReserved || !onClick) return;
    onClick(stand);
  };

  return (
		<div
			className={`${bgColor}`}
			key={standNumber}
			style={style}
			onClick={handleClick}
		>
			<StandContent
				canBeReserved={canBeReserved}
				stand={stand}
				participantProfiles={participantProfiles}
				standPosition={{ top: positionTop || 0, left: positionLeft || 0 }}
			/>
		</div>
	);
}
