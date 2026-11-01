import Link from "next/link";

import {
  COMUNICADO_RECIPIENT_FILTER_LABELS,
  COMUNICADO_RECIPIENT_FILTERS,
  type ComunicadoRecipientFilter,
  comunicadoReportHref,
} from "@/app/lib/comunicados/report-labels";
import { cn } from "@/lib/utils";

/**
 * "Todos" · "No leídos" · "Correo no enviado" · "Omitidos" · "Con error"
 * (G6), as links: a chip keeps the search and goes back to the first page.
 */
export default function RecipientsFilters({
  comunicadoId,
  filter,
  query,
  emailOnly = false,
}: {
  comunicadoId: number;
  filter: ComunicadoRecipientFilter;
  query: string;
  /** A visitor comunicado (§L): nothing is read in the app. */
  emailOnly?: boolean;
}) {
  const filters = emailOnly
    ? COMUNICADO_RECIPIENT_FILTERS.filter((value) => value !== "unread")
    : COMUNICADO_RECIPIENT_FILTERS;
  return (
    <nav
      aria-label="Filtrar destinatarios"
      className="-mx-1 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max gap-2">
        {filters.map((value) => (
          <li key={value}>
            <Link
              href={comunicadoReportHref(comunicadoId, {
                filter: value,
                query,
              })}
              scroll={false}
              aria-current={value === filter ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors",
                value === filter
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {COMUNICADO_RECIPIENT_FILTER_LABELS[value]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
