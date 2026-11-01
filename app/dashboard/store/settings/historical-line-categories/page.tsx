import { redirect } from "next/navigation";

import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import HistoricalCategoryFilters from "@/app/components/organisms/store/historical-category-filters";
import HistoricalCategorySourcesTable from "@/app/components/organisms/store/historical-category-sources-table";
import { fetchHistoricalLineCategorySourcesForAdmin } from "@/app/lib/orders/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HistoricalLineCategoriesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin") {
    redirect("/dashboard/store");
  }

  const searchParams = await props.searchParams;
  const sources = await fetchHistoricalLineCategorySourcesForAdmin({
    from: first(searchParams.from),
    to: first(searchParams.to),
    orderId: first(searchParams.orderId),
    q: first(searchParams.q),
    snapshotCategory: first(searchParams.snapshotCategory) as
      | "merch"
      | "supplies"
      | undefined,
    currentProductCategory: first(searchParams.currentProductCategory) as
      | "merch"
      | "supplies"
      | undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <PageBreadcrumbs />
          <h3 className="text-xl font-semibold" data-installed-title="">
            Corregir categorías históricas
          </h3>
          <p className="text-sm text-muted-foreground md:text-base">
            Herramienta temporal para reclasificar líneas de pedidos anteriores
            al Mercadito de Insumos. No cambia precios, costos, stock ni
            estados. Muestra los últimos 45 días si no filtras por fecha.
          </p>
        </div>
      </div>

      <HistoricalCategoryFilters />
      <HistoricalCategorySourcesTable sources={sources} />
    </div>
  );
}
