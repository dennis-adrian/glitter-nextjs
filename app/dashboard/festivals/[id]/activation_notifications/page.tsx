import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import ActivationReportKpis from "@/app/components/festivals/activation-report/activation-report-kpis";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import {
  ACTIVATION_RECIPIENT_FILTERS,
  ACTIVATION_RECIPIENTS_PAGE_SIZE,
  fetchActivationRecipients,
  fetchActivationReport,
} from "@/app/lib/festivals/activation-report";
import {
  ACTIVATION_FILTER_LABELS,
  enrollmentCell,
  PUSH_SENT_NOTE,
  pushCell,
  readCell,
} from "@/app/lib/festivals/activation-report-copy";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { cn } from "@/app/lib/utils";

export const metadata: Metadata = { title: "Invitación en Glitter" };

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const SearchSchema = z.object({
  filter: z.enum(ACTIVATION_RECIPIENT_FILTERS).catch("all"),
  page: z.coerce.number().int().min(1).catch(1),
});

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Who got the festival's activation notice in Glitter, whether they read it,
 * what became of its pushes, and whether they enrolled.
 */
export default async function ActivationNotificationsPage({
  params,
  searchParams,
}: PageProps) {
  // The layout checks too, but a layout is not a boundary.
  if (!(await requireAdminOrFestivalAdmin())) redirect("/");

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return notFound();
  const festivalId = parsed.data.id;
  const raw = await searchParams;
  const { filter, page } = SearchSchema.parse({
    filter: typeof raw.filter === "string" ? raw.filter : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });

  const [festival, report, { recipients, total }] = await Promise.all([
    fetchBaseFestival(festivalId),
    fetchActivationReport(festivalId),
    fetchActivationRecipients(festivalId, { filter, page }),
  ]);
  if (!festival) return notFound();

  const pages = Math.max(1, Math.ceil(total / ACTIVATION_RECIPIENTS_PAGE_SIZE));
  const href = (next: { filter?: string; page?: number }) => {
    const query = new URLSearchParams();
    const nextFilter = next.filter ?? filter;
    if (nextFilter !== "all") query.set("filter", nextFilter);
    const nextPage = next.page ?? 1;
    if (nextPage > 1) query.set("page", String(nextPage));
    const qs = query.toString();
    return `/dashboard/festivals/${festivalId}/activation_notifications${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="container flex flex-col gap-6 p-4 md:p-6">
      <div>
        <PageBreadcrumbs
          className="mb-4"
          labels={{ [`/dashboard/festivals/${festivalId}`]: festival.name }}
        />
        <h1 className="text-2xl font-bold" data-installed-title="">
          Invitación en Glitter
        </h1>
        <p className="text-muted-foreground">{festival.name}</p>
      </div>

      {!report ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Todavía no se envió la notificación de este festival. Sale al
          activarlo, si dejás marcada la opción de notificar en Glitter.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <ActivationReportKpis
              report={report}
              className="md:grid-cols-4"
            />
            <p className="text-xs text-muted-foreground">{PUSH_SENT_NOTE}</p>
          </div>

          <nav aria-label="Filtrar" className="flex flex-wrap gap-2">
            {ACTIVATION_RECIPIENT_FILTERS.map((option) => (
              <Link
                key={option}
                href={href({ filter: option })}
                aria-current={option === filter ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  option === filter
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {ACTIVATION_FILTER_LABELS[option]}
              </Link>
            ))}
          </nav>

          {recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nadie coincide con este filtro.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participante</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Lectura</TableHead>
                    <TableHead>Push</TableHead>
                    <TableHead>Inscripción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((recipient) => (
                    <TableRow key={recipient.userId}>
                      <TableCell>
                        <Link
                          href={`/dashboard/users/${recipient.userId}`}
                          className="font-medium hover:underline"
                        >
                          {recipient.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {recipient.email}
                        </p>
                      </TableCell>
                      <TableCell>
                        {recipient.category === "none"
                          ? "—"
                          : getCategoryLabel(recipient.category)}
                      </TableCell>
                      <TableCell>{readCell(recipient)}</TableCell>
                      <TableCell>{pushCell(recipient.push)}</TableCell>
                      <TableCell>{enrollmentCell(recipient.enrollment)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {pages > 1 ? (
            <div className="flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className="hover:underline">
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                Página {page} de {pages} · {total.toLocaleString("es-BO")}{" "}
                {total === 1 ? "participante" : "participantes"}
              </span>
              {page < pages ? (
                <Link href={href({ page: page + 1 })} className="hover:underline">
                  Siguiente
                </Link>
              ) : (
                <span />
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
