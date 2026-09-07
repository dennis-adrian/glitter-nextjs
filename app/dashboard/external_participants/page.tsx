import ExternalParticipantsTable from "@/app/components/organisms/external_participants/table/external-participants-table";
import { RedirectButton } from "@/app/components/redirect-button";
import { Suspense } from "react";

export default function ExternalParticipantsPage() {
  return (
    <div className="container p-4 md:p-6">
      <h1 className="text-2xl font-bold">Participantes externos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Instituciones, auspiciantes y otros participantes que no tienen cuenta
        en Glitter.
      </p>
      <div className="my-4 w-full">
        <RedirectButton href="/dashboard/external_participants/add">
          Agregar participante
        </RedirectButton>
        <Suspense fallback={<div>Cargando...</div>}>
          <ExternalParticipantsTable />
        </Suspense>
      </div>
    </div>
  );
}
