import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import {
  COMUNICADO_REPORT_PAGE_SIZE,
  type ComunicadoRecipientFilter,
  comunicadoReportHref,
  recipientsRangeLabel,
} from "@/app/lib/comunicados/report-labels";

/** "1–50 de 1.254" with Anterior / Siguiente, keeping the chip and the search. */
export default function RecipientsPagination({
  comunicadoId,
  filter,
  query,
  page,
  pageCount,
  total,
}: {
  comunicadoId: number;
  filter: ComunicadoRecipientFilter;
  query: string;
  page: number;
  pageCount: number;
  total: number;
}) {
  if (total === 0) return null;
  const href = (target: number) =>
    comunicadoReportHref(comunicadoId, { filter, query, page: target });
  const range = (
    <span className="text-sm tabular-nums text-muted-foreground">
      {recipientsRangeLabel(page, COMUNICADO_REPORT_PAGE_SIZE, total)}
    </span>
  );
  if (pageCount <= 1) {
    return <div className="flex justify-end">{range}</div>;
  }

  return (
    <nav
      className="flex items-center justify-end gap-3"
      aria-label="Paginación"
    >
      {page <= 1 ? (
        <Button variant="outline" size="sm" disabled aria-disabled="true">
          Anterior
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)}>Anterior</Link>
        </Button>
      )}
      {range}
      {page >= pageCount ? (
        <Button variant="outline" size="sm" disabled aria-disabled="true">
          Siguiente
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)}>Siguiente</Link>
        </Button>
      )}
    </nav>
  );
}
