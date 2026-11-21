"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import BrandIcon from "@/app/components/brand-icon";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import {
  formatShiftList,
  hasVolunteerFilters,
  volunteerAgeAndPhone,
} from "@/app/components/volunteers/admin/volunteer-admin-list-params";
import VolunteerApplicationRowMenu from "@/app/components/volunteers/admin/volunteer-applications-row-actions";
import VolunteerStatusBadge from "@/app/components/volunteers/admin/volunteer-status-badge";
import { cn } from "@/app/lib/utils";
import {
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_ADMIN_PAGE_SIZES,
  volunteerApplicationAdminPath,
  whatsappHref,
  type VolunteerAdminRole,
  type VolunteerAdminShift,
  type VolunteerApplicationListItem,
  type VolunteerApplicationsFilters,
  type VolunteerStatusFilter,
} from "@/app/lib/volunteers/admin-definitions";
import {
  compareShiftsByStart,
  formatShiftWhen,
} from "@/app/lib/volunteers/format";

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

const columnTitles = {
  applicant: "Postulante",
  available: "Turnos disponibles",
  roles: "Roles preferidos",
  status: "Estado",
  assignment: "Asignación",
};

function inactive(isActive: boolean, label: string) {
  return isActive ? label : `${label} (inactivo)`;
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
        <BrandIcon brand="whatsapp" />
      </a>
    </Button>
  );
}

type RowContext = {
  festivalId: number;
  shifts: readonly VolunteerAdminShift[];
  today?: Date;
};

/** The table's columns, from md. None sorts: the list has a fixed order. */
function volunteerApplicationColumns({
  festivalId,
  shifts,
  today,
}: RowContext): ColumnDef<VolunteerApplicationListItem>[] {
  return [
    {
      id: "applicant",
      header: columnTitles.applicant,
      enableSorting: false,
      cell: ({ row: { original: item } }) => (
        <div className="max-w-72 min-w-48">
          <Link
            href={volunteerApplicationAdminPath(festivalId, item.id)}
            className={cn("break-words", nameLinkClass)}
          >
            {item.fullName}
          </Link>
          <p className="break-words text-muted-foreground tabular-nums">
            {volunteerAgeAndPhone(item, today)}
          </p>
        </div>
      ),
    },
    {
      id: "available",
      header: columnTitles.available,
      enableSorting: false,
      cell: ({ row: { original: item } }) => (
        <div className="max-w-64 min-w-36 break-words">
          {formatShiftList(item.availableShiftIds, shifts, { all: true }) ?? (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      id: "roles",
      header: columnTitles.roles,
      enableSorting: false,
      cell: ({ row: { original: item } }) => (
        <div className="max-w-64 min-w-44">
          <p className="break-words">1ª {item.firstChoiceRoleName}</p>
          <p className="break-words text-muted-foreground">
            2ª {item.secondChoiceRoleName}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: columnTitles.status,
      enableSorting: false,
      cell: ({ row: { original: item } }) => (
        <VolunteerStatusBadge status={item.status} />
      ),
    },
    {
      id: "assignment",
      header: columnTitles.assignment,
      enableSorting: false,
      cell: ({ row: { original: item } }) => {
        const assigned = assignment(item, shifts);
        return (
          <div className="max-w-64 min-w-36">
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
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row: { original: item } }) => (
        <div className="flex justify-end gap-1">
          <WhatsAppLink item={item} />
          <VolunteerApplicationRowMenu
            festivalId={festivalId}
            applicationId={item.id}
            name={item.fullName}
            status={item.status}
          />
        </div>
      ),
    },
  ];
}

/** One application on a phone: who, their status and choices, WhatsApp. */
function ApplicationCard({
  item,
  festivalId,
  shifts,
  today,
}: RowContext & { item: VolunteerApplicationListItem }) {
  const assigned = assignment(item, shifts);
  const available = formatShiftList(item.availableShiftIds, shifts, {
    all: true,
  });
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border bg-card p-3 text-sm">
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
              1ª {item.firstChoiceRoleName} · 2ª {item.secondChoiceRoleName}
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
    </div>
  );
}

/**
 * One page of the "Postulaciones" card on the dashboard's server table: the
 * search, the "Turno disponible" and "Rol preferido" filters and the pager
 * are URL state (`query`, `shiftId`, `roleId`, `limit`, `offset`); a card per
 * application on phones.
 */
export default function VolunteerApplicationsList({
  festivalId,
  items,
  total,
  filters,
  roles,
  shifts,
  today,
}: {
  festivalId: number;
  items: VolunteerApplicationListItem[];
  total: number;
  filters: VolunteerApplicationsFilters;
  roles: VolunteerAdminRole[];
  shifts: VolunteerAdminShift[];
  /** For the ages; tests and stories pin it. */
  today?: Date;
}) {
  const context = { festivalId, shifts, today };
  const columns = volunteerApplicationColumns(context);
  const shiftOptions = [...shifts].sort(compareShiftsByStart).map((shift) => ({
    value: `${shift.id}`,
    label: inactive(
      shift.isActive,
      `${formatShiftWhen(shift)} — ${shift.label}`,
    ),
  }));
  const roleOptions = roles.map((role) => ({
    value: `${role.id}`,
    label: inactive(role.isActive, role.name),
  }));

  return (
    <DataTable
      columns={columns}
      data={items}
      columnTitles={columnTitles}
      getRowId={(item) => String(item.id)}
      server={{ rowCount: total, defaultPageSize: 25 }}
      pageSizes={VOLUNTEER_ADMIN_PAGE_SIZES}
      searchPlaceholder="Buscar por nombre, celular o correo"
      filters={[
        {
          columnId: "shift",
          param: "shiftId",
          label: "Turno disponible",
          multiple: false,
          options: shiftOptions,
        },
        {
          columnId: "role",
          param: "roleId",
          label: "Rol preferido",
          multiple: false,
          options: roleOptions,
        },
      ]}
      renderMobileRow={(item) => <ApplicationCard item={item} {...context} />}
      emptyMessage={
        // Past the last page there are matches, just not on this page.
        total > 0
          ? "No hay más postulaciones en esta página."
          : volunteerApplicationsEmptyMessage(filters)
      }
    />
  );
}
