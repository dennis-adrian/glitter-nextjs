"use client";

import { useState } from "react";
import {
  ElementSize,
  StandPosition,
  StandWithReservationsWithParticipants,
} from "@/app/api/stands/definitions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import StandArtists from "@/app/components/stands/stand-artists";
import { StandStatusBadge } from "@/app/components/stands/status-badge";
import clsx from "clsx";

type Props = {
  stand: StandWithReservationsWithParticipants;
  standPosition: Omit<StandPosition, "id">;
};

const StandContent = ({ stand, standPosition }: Props) => {
  const { label, standNumber, status } = stand;
  const { left } = standPosition;

  const [tooltipVisible, setTooltipVisible] = useState(false);
  const showTooltip = () => {
    setTooltipVisible(true);
  };

  const hideTooltip = () => {
    setTooltipVisible(false);
  };

  let statusColor = "text-zinc-500";
  if (status == "reserved") {
    statusColor = "text-emerald-500";
  } else if (status === "confirmed") {
    statusColor = "text-fuchsia-700";
  }

  return (
    <div
      className="w-full h-full z-10 inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <Card
        className={clsx(`absolute z-10 hidden transform -translate-y-1/2`, {
          block: tooltipVisible,
          "right-[110%]": left > 50,
          "left-[110%]": left < 50,
        })}
      >
        <CardHeader>
          <CardTitle className="text-base">
            Espacio {label}
            {standNumber}
          </CardTitle>
          <CardDescription>
            <StandStatusBadge status={status} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="min-w-36">
            {status !== "disabled" && <StandArtists stand={stand} />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StandContent;
