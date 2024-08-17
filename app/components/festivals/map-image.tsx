"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { StandShape } from "@/app/components/stands/stand";
import { canStandBeReserved } from "@/app/lib/stands/helpers";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type MapImageProps = {
  mapSrc: string;
  stands: StandWithReservationsWithParticipants[];
  forReservation?: boolean;
  profile?: ProfileType | BaseProfile | null;
  onStandClick?: (stand: StandWithReservationsWithParticipants) => void;
};

export default function MapImage(props: MapImageProps) {
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [participantProfiles, setParticipantProfiles] = useState<ProfileType[]>(
    [],
  );
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

  useEffect(() => {
    const reservations = props.stands.flatMap((stand) => stand.reservations);
    const participantIds = reservations.flatMap((reservation) =>
      reservation.participants.map((participant) => participant.user.id),
    );

    fetch("/api/users_by_id", {
      method: "POST",
      body: JSON.stringify({
        ids: participantIds,
      }),
    }).then((res) => {
      if (res.ok) {
        (res.json() as Promise<ProfileType[]>).then((profiles) => {
          setParticipantProfiles(profiles);
        });
      }
    });
  }, [props.stands]);

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
          props.forReservation &&
          canStandBeReserved(stand, props.profile as ProfileType);

        const participantIds = stand.reservations
          ?.filter((reservation) => reservation.status !== "rejected")
          .flatMap((reservation) =>
            reservation.participants.map((participant) => participant.user.id),
          );

        const profiles = participantProfiles.filter((profile) =>
          participantIds.includes(profile.id),
        );

        return (
          <StandShape
            key={stand.id}
            canBeReserved={canBeReserved}
            imageSize={dimensions}
            participantProfiles={profiles}
            stand={stand}
            onClick={props.onStandClick}
          />
        );
      })}
    </div>
  );
}
