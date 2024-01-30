"use server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Festival } from "@/app/api/festivals/actions";
import BaseCard from "./base-card";

export default async function PendingParticipationCard({
  festival,
}: {
  festival: Festival;
}) {
  return (
    <BaseCard
      title="Estamos considerando tu solicitud"
      content={
        <>
          <p>
            Hemos recibido tu solicitud para participar de{" "}
            <strong>{festival.name}</strong>. Recibirás un correo para saber si{" "}
            fuiste seleccionado o no.
          </p>
          <p className="text-primary mt-1">
            <strong>¡Gracias por postular!</strong>
          </p>
        </>
      }
    />
  );
}
