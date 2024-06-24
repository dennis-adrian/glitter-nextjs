"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { ProfileType } from "@/app/api/users/definitions";
import { StandShape } from "@/app/components/stands/stand";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export default function MapImage({
  mapSrc,
  stands,
  onStandClick,
}: {
  mapSrc: string;
  stands: StandWithReservationsWithParticipants[];
  onStandClick?: (stand: StandWithReservationsWithParticipants) => void;
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
        src={mapSrc}
        width={420}
        height={646}
        onLoad={() => setIsMapLoaded(true)}
      />
      {stands.map((stand) => {
        return (
          <StandShape
            key={stand.id}
            imageSize={dimensions}
            stand={stand}
            onClick={onStandClick}
          />
        );
      })}
    </div>
  );
}
