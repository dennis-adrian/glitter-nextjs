"use client";

import { ParticipationWithParticipantWithInfractionsAndReservations } from "@/app/api/users/definitions";
import { CircleAlertIcon, MailCheckIcon, MailXIcon } from "lucide-react";
import Link from "next/link";
import { Tooltip } from "react-tooltip";

type InfractionsCellProps = {
  participant: ParticipationWithParticipantWithInfractionsAndReservations;
};

export default function InfractionsCell({ participant }: InfractionsCellProps) {
  return (
    <div className="space-y-1">
      <Tooltip id="tooltip" className="z-50 max-w-40" delayShow={100} />
      <ul className="list-disc">
        {participant.user.infractions.map((infraction) => (
          <li key={infraction.id}>
            <span className="flex items-center gap-1">
              <Link
                href={`/dashboard/infractions/${infraction.id}`}
                className="text-sm hover:underline"
              >
                {infraction.type.label}
              </Link>
              <CircleAlertIcon
                data-tooltip-id="tooltip"
                data-tooltip-content={
                  infraction.type.description ?? "Sin descripción"
                }
                className="w-4 h-4 text-amber-500"
              />
              {infraction.userGaveNotice ? (
                <MailCheckIcon
                  data-tooltip-id="tooltip"
                  data-tooltip-content={
                    infraction.gaveNoticeAt
                      ? "El participante dio aviso previo"
                      : "El participante dio aviso previo (fecha no registrada)"
                  }
                  className="w-4 h-4 text-green-500"
                />
              ) : (
                <MailXIcon
                  data-tooltip-id="tooltip"
                  data-tooltip-content="Sin aviso previo del participante"
                  className="w-4 h-4 text-red-500"
                />
              )}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href={`/dashboard/infractions?userId=${participant.user.id}&limit=25&offset=0`}
        className="text-xs text-primary hover:underline"
      >
        Ver historial global
      </Link>
    </div>
  );
}
