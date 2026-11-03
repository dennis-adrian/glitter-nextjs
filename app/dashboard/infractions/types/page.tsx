import InfractionTypesManager from "@/app/components/infractions/types/manager";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import { fetchAllInfractionTypes } from "@/app/lib/infraction-types/actions";

export default async function InfractionTypesPage() {
  const types = await fetchAllInfractionTypes();

  return (
    <div className="container mx-auto space-y-5 p-3 md:p-6">
      <div className="space-y-2">
        <PageBreadcrumbs />
        <div>
          <h1
            className="text-2xl font-bold md:text-3xl"
            data-installed-title=""
          >
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
