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
      className="bg-gradient-to-r from-rose-400 to-red-500"
      title="Estamos considerando tu solicitud"
      content={
        <div className="mb-3">
          <p>
            Hemos recibido tu solicitud para reservar tu espacio en{" "}
            <strong>{festival.name}</strong>. Recibirás un correo notificándote
            que ya puedes reservar
          </p>
          <p className="font-semibold mt-2">¡Gracias por postular! 🎉</p>
        </div>
      }
    />
  );
}
