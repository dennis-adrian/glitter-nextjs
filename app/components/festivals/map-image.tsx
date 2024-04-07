"use client";

import { Stand } from "@/app/api/stands/actions";
import { StandPosition } from "@/app/api/stands/definitions";
import { ProfileType } from "@/app/api/users/definitions";
import {
  standProportions,
  standsPositions,
} from "@/app/components/next_event/config";
import { StandShape } from "@/app/components/stands/stand";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export default function MapImage({
  profile,
  stands,
  onStandClick,
}: {
  profile?: ProfileType | null;
  stands: Stand[];
  onStandClick: (stand: Stand) => void;
}) {
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const handleSizeChange = () => {
      if (isMapLoaded) {
        imgRef.current &&
          setDimensions({
            width: imgRef.current.width,
            height: imgRef.current.height,
          });
      }
    };

    window.addEventListener("resize", handleSizeChange);
    if (isMapLoaded) {
      imgRef.current &&
        setDimensions({
          width: imgRef.current.width,
          height: imgRef.current.height,
        });
    }

    return () => {
      window.removeEventListener("resize", handleSizeChange);
    };
  }, [isMapLoaded, imgRef]);

  return (
    <div className="relative">
      <Image
        ref={imgRef}
        alt="mapa del evento"
        src="/img/glitter_v2_artists_map.png"
        width={770}
        height={646}
        onLoad={() => setIsMapLoaded(true)}
      />
      {stands.map((stand) => {
        const position = standsPositions.find(
          (position: StandPosition) => position.id === stand.standNumber,
        ) ?? { left: 0, top: 0 };
        return (
          <StandShape
            key={stand.id}
            imageSize={dimensions}
            profile={profile}
            proportions={standProportions}
            position={position}
            stand={stand}
            onClick={onStandClick}
          />
        );
      })}
    </div>
  );
}
