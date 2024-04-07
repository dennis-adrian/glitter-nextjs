"use server";

import { FestivalBase } from "@/app/data/festivals/definitions";
import BaseCard from "./base-card";

export default async function PendingParticipationCard({
  festival,
}: {
  festival: FestivalBase;
}) {
  return (
    <BaseCard
      content={
        <div>
          <p>
            Hemos recibido tu solicitud para reservar tu espacio en{" "}
            <strong>{festival.name}</strong>. Recibirás un correo notificándote
            que ya puedes reservar
          </p>
        </div>
      }
    />
  );
}
