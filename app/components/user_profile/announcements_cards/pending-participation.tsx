"use server";

import { FestivalBase } from "@/app/api/festivals/definitions";
import BaseCard from "./base-card";

export default async function PendingParticipationCard({
  festival,
}: {
  festival: FestivalBase;
}) {
  return (
    <BaseCard
      title="Estamos considerando tu solicitud"
      content={
        <>
          <p>
            Hemos recibido tu solicitud para reservar tu espacio en{" "}
            <strong>{festival.name}</strong>. Recibirás un correo notificándote
            que ya puedes reservar
          </p>
          <p className="text-primary mt-2">
            <strong>¡Gracias por postular!</strong>
          </p>
        </>
      }
    />
  );
}
