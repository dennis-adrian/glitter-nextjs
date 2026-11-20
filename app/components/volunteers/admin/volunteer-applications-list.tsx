import { DateTime } from "luxon";
import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import UsersTablePagination from "@/app/components/users/users-table-pagination";
import VolunteerStatusBadge from "@/app/components/volunteers/admin/volunteer-status-badge";
import { formatDisplayDate } from "@/app/lib/formatters";
import {
  VOLUNTEER_ADMIN_PAGE_SIZES,
  volunteerApplicationAdminPath,
  type VolunteerApplicationListItem,
  type VolunteerApplicationsFilters,
} from "@/app/lib/volunteers/admin-definitions";

const linkClass =
  "font-medium text-primary underline-offset-2 hover:underline focus-visible:underline";

const EMPTY_BY_STATUS: Record<VolunteerApplicationsFilters["status"], string> =
  {
    pending: "No hay postulaciones por revisar.",
    accepted: "Todavía no hay postulaciones aceptadas.",
    waitlist: "No hay postulaciones en espera.",
    rejected: "No hay postulaciones rechazadas.",
    all: "Todavía no llegó ninguna postulación.",
  };

/** What the inbox says when the current tab and filters match nothing. */
export function volunteerApplicationsEmptyMessage(
  filters: VolunteerApplicationsFilters,
) {
  if (filters.query || filters.roleId != null || filters.shiftId != null) {
    return "Ninguna postulación coincide con la búsqueda y los filtros.";
  }
  return EMPTY_BY_STATUS[filters.status];
}

function shiftCount(count: number) {
  return count === 1 ? "1 turno" : `${count} turnos`;
}

function appliedOn(date: Date) {
  return formatDisplayDate(date, DateTime.DATE_MED);
}

/** The role and shifts given, once accepted; nothing before. */
function assignment(item: VolunteerApplicationListItem) {
  if (item.status !== "accepted") return null;
  const role = item.assignedRoleName ?? "Sin rol";
  return `${role} · ${shiftCount(item.assignedShiftCount)}`;
}

function Choices({ item }: { item: VolunteerApplicationListItem }) {
  return (
    <ul className="space-y-0.5">
      <li className="break-words">
        <span className="text-muted-foreground">1ª </span>
        {item.firstChoiceRoleName}
      </li>
      <li className="break-words">
        <span className="text-muted-foreground">2ª </span>
        {item.secondChoiceRoleName}
      </li>
    </ul>
  );
}

function ApplicationsTable({
  festivalId,
  items,
}: {
  festivalId: number;
  items: VolunteerApplicationListItem[];
}) {
  return (
    <div className="hidden overflow-x-auto rounded-md border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Roles elegidos</TableHead>
            <TableHead>Turnos disponibles</TableHead>
            <TableHead>Asignación</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Postuló</TableHead>
            <TableHead>
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const href = volunteerApplicationAdminPath(festivalId, item.id);
            const assigned = assignment(item);
            return (
              <TableRow key={item.id}>
                <TableCell className="max-w-72 min-w-48">
                  <Link href={href} className={`break-words ${linkClass}`}>
                    {item.fullName}
                  </Link>
                  <p className="text-xs text-muted-foreground wrap-anywhere">
                    {item.email}
                  </p>
                </TableCell>
                <TableCell className="max-w-60 min-w-40">
                  <Choices item={item} />
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {shiftCount(item.availableShiftCount)}
                </TableCell>
                <TableCell className="max-w-56 min-w-32 break-words">
                  {assigned ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <VolunteerStatusBadge status={item.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {appliedOn(item.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={href}
                    className={linkClass}
                    aria-label={`Ver la postulación de ${item.fullName}`}
                  >
                    Ver
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ApplicationCards({
  festivalId,
  items,
}: {
  festivalId: number;
  items: VolunteerApplicationListItem[];
}) {
  return (
    <ul
      aria-label="Postulaciones"
      className="flex min-w-0 flex-col gap-2 md:hidden"
    >
      {items.map((item) => {
        const assigned = assignment(item);
        return (
          <li key={item.id}>
            <Link
              href={volunteerApplicationAdminPath(festivalId, item.id)}
              className="flex min-w-0 flex-col gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium break-words">{item.fullName}</p>
                  <p className="text-xs text-muted-foreground wrap-anywhere">
                    {item.email}
                  </p>
                </div>
                <div className="shrink-0">
                  <VolunteerStatusBadge status={item.status} />
                </div>
              </div>
              <Choices item={item} />
              <p className="text-xs text-muted-foreground">
                {shiftCount(item.availableShiftCount)} disponibles · Postuló el{" "}
                {appliedOn(item.createdAt)}
              </p>
              {assigned && (
                <p className="break-words">
                  <span className="text-muted-foreground">Asignación: </span>
                  {assigned}
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One page of the inbox: a table on wider screens, cards on phones, and the
 * pager. Each row opens the application.
 */
export default function VolunteerApplicationsList({
  festivalId,
  items,
  total,
  filters,
}: {
  festivalId: number;
  items: VolunteerApplicationListItem[];
  total: number;
  filters: VolunteerApplicationsFilters;
}) {
  const pageCount = Math.ceil(total / filters.limit);
  const pageIndex = Math.floor(filters.offset / filters.limit) + 1;

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
          <ApplicationsTable festivalId={festivalId} items={items} />
          <ApplicationCards festivalId={festivalId} items={items} />
        </>
      )}
      {total > 0 && (
        <div className="min-w-0 overflow-x-auto">
          <UsersTablePagination
            canNextPage={pageIndex < pageCount}
            canPreviousPage={pageIndex > 1}
            pageIndex={pageIndex}
            pageCount={pageCount}
            pageSize={`${filters.limit}`}
            rowCount={items.length}
            total={total}
            pageSizes={VOLUNTEER_ADMIN_PAGE_SIZES}
          />
        </div>
      )}
    </div>
  );
}
