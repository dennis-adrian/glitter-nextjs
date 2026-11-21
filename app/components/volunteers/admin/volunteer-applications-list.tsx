import { MessageCircleIcon } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/app/components/ui/button";
import { toolbarButtonClass } from "@/app/components/ui/data_table/styles";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  formatShiftList,
  hasVolunteerFilters,
  roleFilterLabel,
  shiftFilterLabel,
  volunteerAgeAndPhone,
  volunteerListHref,
} from "@/app/components/volunteers/admin/volunteer-admin-list-params";
import VolunteerApplicationRowMenu from "@/app/components/volunteers/admin/volunteer-applications-row-actions";
import VolunteerStatusBadge from "@/app/components/volunteers/admin/volunteer-status-badge";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { cn } from "@/app/lib/utils";
import {
  VOLUNTEER_ADMIN_COPY,
  volunteerApplicationAdminPath,
  whatsappHref,
  type VolunteerAdminRole,
  type VolunteerAdminShift,
  type VolunteerApplicationListItem,
  type VolunteerApplicationsFilters,
  type VolunteerStatusFilter,
} from "@/app/lib/volunteers/admin-definitions";

const nameLinkClass =
  "font-semibold text-primary underline-offset-2 hover:underline focus-visible:underline";

const EMPTY_BY_STATUS: Record<VolunteerStatusFilter, string> = {
  all: "Todavía no llegó ninguna postulación.",
  pending: "No hay postulaciones pendientes.",
  accepted: "Todavía no hay postulaciones aceptadas.",
  waitlist: "No hay postulaciones en espera.",
  rejected: "No hay postulaciones no aceptadas.",
};

/** What the list says when the current chip and filters match nothing. */
export function volunteerApplicationsEmptyMessage(
  filters: VolunteerApplicationsFilters,
) {
  if (hasVolunteerFilters(filters)) {
    return "Ninguna postulación coincide con la búsqueda y los filtros.";
  }
  return EMPTY_BY_STATUS[filters.status];
}

/**
 * "Mostrando 5 de 9 postulaciones con Fotografía como rol preferido": the
 * page's share of the matches, naming the filters that narrowed them.
 */
export function volunteerApplicationsSummary({
  shown,
  total,
  offset,
  filters,
  roles,
  shifts,
}: {
  shown: number;
  total: number;
  offset: number;
  filters: VolunteerApplicationsFilters;
  roles: readonly VolunteerAdminRole[];
  shifts: readonly VolunteerAdminShift[];
}) {
  // Past the first page, which ones: "26–50 de 60".
  const range =
    offset > 0 && shown > 0
      ? shown > 1
        ? `${offset + 1}–${offset + shown}`
        : `${offset + 1}`
      : `${shown}`;
  const noun = total === 1 ? "postulación" : "postulaciones";
  const narrowed = [
    filters.roleId != null &&
      `${roleFilterLabel(roles, filters.roleId)} como rol preferido`,
    filters.shiftId != null &&
      `${shiftFilterLabel(shifts, filters.shiftId, true)} como turno disponible`,
  ].filter(Boolean);
  const suffix = narrowed.length ? ` con ${narrowed.join(" y ")}` : "";
  return `Mostrando ${range} de ${total} ${noun}${suffix}`;
}

/** What the application was given, which counts only once accepted. */
function assignment(
  item: VolunteerApplicationListItem,
  shifts: readonly VolunteerAdminShift[],
) {
  if (item.status !== "accepted") return null;
  const shiftList = formatShiftList(item.assignedShiftIds, shifts);
  if (!item.assignedRoleName && !shiftList) return null;
  return { role: item.assignedRoleName, shifts: shiftList };
}

function WhatsAppLink({
  item,
  className,
}: {
  item: VolunteerApplicationListItem;
  className?: string;
}) {
  const href = whatsappHref(item.phone);
  if (!href) return null;
  return (
    <Button asChild variant="ghost" size="icon" className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Escribir por WhatsApp a ${item.fullName}`}
      >
        <MessageCircleIcon aria-hidden="true" className="h-4 w-4" />
      </a>
    </Button>
  );
}

type RowsProps = {
  festivalId: number;
  items: VolunteerApplicationListItem[];
  shifts: VolunteerAdminShift[];
  today?: Date;
};

function ApplicationsTable({ festivalId, items, shifts, today }: RowsProps) {
  return (
    <div className="hidden md:-mx-6 md:block">
      <Table className="min-w-[980px]">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Postulante</TableHead>
            <TableHead scope="col">Turnos disponibles</TableHead>
            <TableHead scope="col">Roles preferidos</TableHead>
            <TableHead scope="col">Estado</TableHead>
            <TableHead scope="col">Asignación</TableHead>
            <TableHead scope="col">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const assigned = assignment(item, shifts);
            const available = formatShiftList(item.availableShiftIds, shifts, {
              all: true,
            });
            return (
              <TableRow key={item.id}>
                <TableCell className="max-w-72 min-w-48">
                  <Link
                    href={volunteerApplicationAdminPath(festivalId, item.id)}
                    className={cn("break-words", nameLinkClass)}
                  >
                    {item.fullName}
                  </Link>
                  <p className="break-words text-muted-foreground tabular-nums">
                    {volunteerAgeAndPhone(item, today)}
                  </p>
                </TableCell>
                <TableCell className="max-w-64 min-w-36 break-words">
                  {available ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-64 min-w-44">
                  <p className="break-words">1ª {item.firstChoiceRoleName}</p>
                  <p className="break-words text-muted-foreground">
                    2ª {item.secondChoiceRoleName}
                  </p>
                </TableCell>
                <TableCell>
                  <VolunteerStatusBadge status={item.status} />
                </TableCell>
                <TableCell className="max-w-64 min-w-36">
                  {assigned ? (
                    <>
                      <p className="break-words">
                        {assigned.role ?? (
                          <span className="text-muted-foreground">Sin rol</span>
                        )}
                      </p>
                      {assigned.shifts && (
                        <p className="break-words text-muted-foreground">
                          {assigned.shifts}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {VOLUNTEER_ADMIN_COPY.unassigned}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <WhatsAppLink item={item} />
                    <VolunteerApplicationRowMenu
                      festivalId={festivalId}
                      applicationId={item.id}
                      name={item.fullName}
                      status={item.status}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ApplicationCards({ festivalId, items, shifts, today }: RowsProps) {
  return (
    <ul
      aria-label="Postulaciones"
      className="flex min-w-0 flex-col gap-2 md:hidden"
    >
      {items.map((item) => {
        const assigned = assignment(item, shifts);
        const available = formatShiftList(item.availableShiftIds, shifts, {
          all: true,
        });
        return (
          <li
            key={item.id}
            className="flex min-w-0 items-start gap-3 rounded-lg border bg-card p-3 text-sm"
          >
            <div className="flex min-w-0 grow flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={volunteerApplicationAdminPath(festivalId, item.id)}
                  className={cn("min-w-0 wrap-anywhere", nameLinkClass)}
                >
                  {item.fullName}
                </Link>
                <VolunteerStatusBadge status={item.status} />
              </div>
              <p className="break-words text-muted-foreground tabular-nums">
                {volunteerAgeAndPhone(item, today)}
              </p>
              {assigned ? (
                <>
                  <p className="break-words">
                    Asignada: {assigned.role ?? "sin rol"}
                  </p>
                  {assigned.shifts && (
                    <p className="break-words text-muted-foreground">
                      Turnos: {assigned.shifts}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="break-words">
                    1ª {item.firstChoiceRoleName} · 2ª{" "}
                    {item.secondChoiceRoleName}
                  </p>
                  {available && (
                    <p className="break-words text-muted-foreground">
                      Disponible: {available}
                    </p>
                  )}
                </>
              )}
            </div>
            <WhatsAppLink item={item} className="size-11 shrink-0" />
          </li>
        );
      })}
    </ul>
  );
}

const pagerClass = cn(
  buttonVariants({ variant: "outline", size: "sm" }),
  toolbarButtonClass,
  "h-11 md:h-9",
);

/**
 * One page of the "Postulaciones" card: a table from md, a card per
 * application on phones, then how many show and Anterior / Siguiente.
 */
export default function VolunteerApplicationsList({
  festivalId,
  basePath,
  searchParams,
  items,
  total,
  filters,
  roles,
  shifts,
  today,
}: {
  festivalId: number;
  basePath: string;
  searchParams: RawSearchParams;
  items: VolunteerApplicationListItem[];
  total: number;
  filters: VolunteerApplicationsFilters;
  roles: VolunteerAdminRole[];
  shifts: VolunteerAdminShift[];
  /** For the ages; tests and stories pin it. */
  today?: Date;
}) {
  const { offset, limit } = filters;
  const previousOffset = Math.max(offset - limit, 0);
  const nextOffset = offset + limit;
  const canPrevious = offset > 0;
  const canNext = nextOffset < total;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {total > 0
            ? "No hay más postulaciones en esta página."
            : volunteerApplicationsEmptyMessage(filters)}
        </p>
      ) : (
        <>
          <ApplicationsTable
            festivalId={festivalId}
            items={items}
            shifts={shifts}
            today={today}
          />
          <ApplicationCards
            festivalId={festivalId}
            items={items}
            shifts={shifts}
            today={today}
          />
        </>
      )}
      {total > 0 && (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 pt-1 text-sm text-muted-foreground">
          <p className="min-w-0 break-words" aria-live="polite">
            {volunteerApplicationsSummary({
              shown: items.length,
              total,
              offset,
              filters,
              roles,
              shifts,
            })}
          </p>
          <nav aria-label="Páginas" className="flex gap-2">
            {canPrevious ? (
              <Link
                href={volunteerListHref(basePath, searchParams, {
                  offset: previousOffset > 0 ? `${previousOffset}` : null,
                })}
                className={pagerClass}
              >
                Anterior
              </Link>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={pagerClass}
                disabled
              >
                Anterior
              </Button>
            )}
            {canNext ? (
              <Link
                href={volunteerListHref(basePath, searchParams, {
                  offset: `${nextOffset}`,
                })}
                className={pagerClass}
              >
                Siguiente
              </Link>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={pagerClass}
                disabled
              >
                Siguiente
              </Button>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
