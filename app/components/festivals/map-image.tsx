"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { BaseProfile } from "@/app/api/users/definitions";
import { StandShape } from "@/app/components/stands/stand";
import { canStandBeReserved } from "@/app/lib/stands/helpers";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type MapImageProps = {
  mapSrc: string;
  stands: StandWithReservationsWithParticipants[];
  forReservation?: boolean;
  profile?: BaseProfile | null;
  onStandClick?: (stand: StandWithReservationsWithParticipants) => void;
};

export default function MapImage(props: MapImageProps) {
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
        src={props.mapSrc}
        width={420}
        height={646}
        onLoad={() => setIsMapLoaded(true)}
      />
      {props.stands.map((stand) => {
        const canBeReserved =
          props.forReservation && canStandBeReserved(stand, props.profile);

        return (
          <StandShape
            key={stand.id}
            canBeReserved={canBeReserved}
            imageSize={dimensions}
            stand={stand}
            onClick={props.onStandClick}
          />
        );
      })}
    </div>
  );
}
