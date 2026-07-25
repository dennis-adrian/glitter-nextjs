import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import InfractionTypesManager from "@/app/components/infractions/types/manager";
import { fetchAllInfractionTypes } from "@/app/lib/infraction-types/actions";

export default async function InfractionTypesPage() {
  const types = await fetchAllInfractionTypes();

  return (
    <div className="container mx-auto space-y-5 p-3 md:p-6">
      <div className="space-y-2">
        <Link
          href="/dashboard/infractions?limit=25&offset=0"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Volver a infracciones
        </Link>
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">
            Tipos de infracción
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Administrá las categorías que orientan el registro de incidentes.
            Archivá los tipos que ya no deban utilizarse para conservar el
            historial.
          </p>
        </div>
      </div>

      <InfractionTypesManager types={types} />
    </div>
  );
}
