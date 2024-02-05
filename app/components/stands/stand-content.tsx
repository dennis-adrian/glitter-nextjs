"use client";

import { useState } from "react";
import { StandPosition } from "@/app/api/stands/definitions";
import { Stand } from "@/app/api/stands/actions";
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
  stand: Stand;
  standPosition: Omit<StandPosition, "id">;
};

const StandContent = ({ stand, standPosition }: Props) => {
  const { label, standNumber, status, orientation } = stand;
  const { left, top } = standPosition;

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

  let position;
  if (orientation === "landscape" && top! < 50) {
    position = "transform translate-y-6 sm:translate-y-8 -translate-x-3/4";
  } else if (orientation === "landscape" && top! > 50) {
    position = "transform -translate-y-52 -translate-x-3/4";
  } else if (orientation === "portrait" && left! > 50) {
    position = "-left-48 sm:-left-52 top-1/2 transform -translate-y-1/2";
  } else {
    position = "top-1/2 left-10 transform -translate-y-1/2";
  }

  return (
    <div
      className="w-full h-full z-20 absolute inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {tooltipVisible && (
        <Card className={`absolute w-48 ${position}`}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg">
              Espacio {label}
              {standNumber}
            </CardTitle>
            <CardDescription>
              <StandStatusBadge status={status} />
            </CardDescription>
          </CardHeader>
          <CardContent
            className={clsx("p-2", {
              "pb-4": status !== "disabled",
            })}
          >
            {status !== "disabled" && <StandArtists stand={stand} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StandContent;
