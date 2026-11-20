"use client";

import { XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import Search from "@/app/components/ui/search";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import type {
  VolunteerAdminRole,
  VolunteerAdminShift,
} from "@/app/lib/volunteers/admin-definitions";
import { formatShiftWhen } from "@/app/lib/volunteers/format";

/** The select's value for "no filter": Radix refuses an empty value. */
const ALL = "all";

type FilterKey = "roleId" | "shiftId";

/**
 * The query string for the current URL with `key` set to `value` (or removed
 * when null), back on the first page: page four of one filter is rarely page
 * four of another.
 */
export function volunteerFilterHref(
  current: URLSearchParams | string,
  key: FilterKey,
  value: string | null,
) {
  const params = new URLSearchParams(current);
  params.delete("offset");
  if (value && value !== ALL) params.set(key, value);
  else params.delete(key);
  const query = params.toString();
  return query ? `?${query}` : "?";
}

/** The query string without the search and filters; status and size stay. */
export function clearVolunteerFiltersHref(current: URLSearchParams | string) {
  const params = new URLSearchParams(current);
  for (const key of ["query", "roleId", "shiftId", "offset"]) {
    params.delete(key);
  }
  const query = params.toString();
  return query ? `?${query}` : "?";
}

function inactive(isActive: boolean, label: string) {
  return isActive ? label : `${label} (inactivo)`;
}

/**
 * Search by name or email, and narrow the inbox to a role (chosen first,
 * second or assigned) or a shift (available or assigned).
 */
export default function VolunteerApplicationsFilters({
  roles,
  shifts,
}: {
  roles: VolunteerAdminRole[];
  shifts: VolunteerAdminShift[];
}) {
  const searchParams = useSearchParams();
  const { push } = useRouter();
  const [, startTransition] = useTransition();
  // The search box keeps what was typed; clearing remounts it empty.
  const [searchKey, setSearchKey] = useState(0);

  const roleId = searchParams.get("roleId") ?? ALL;
  const shiftId = searchParams.get("shiftId") ?? ALL;
  const hasFilters =
    Boolean(searchParams.get("query")) || roleId !== ALL || shiftId !== ALL;

  function navigate(href: string) {
    startTransition(() => push(href, { scroll: false }));
  }

  // A filter left in the URL for a role or shift that no longer exists still
  // narrows the list; showing it as "Todos" would hide why it is empty.
  const roleKnown = roleId === ALL || roles.some((r) => `${r.id}` === roleId);
  const shiftKnown =
    shiftId === ALL || shifts.some((s) => `${s.id}` === shiftId);

  return (
    <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      <Search
        key={searchKey}
        className="min-w-0 md:w-80"
        placeholder="Buscar por nombre o correo"
        label="Buscar por nombre o correo"
      />
      <div className="grid min-w-0 grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:flex md:flex-wrap md:items-end">
        <div className="flex min-w-0 flex-col gap-1">
          <Label
            htmlFor="volunteer-role-filter"
            className="text-sm font-normal text-muted-foreground"
          >
            Rol
          </Label>
          <Select
            value={roleId}
            onValueChange={(value) =>
              navigate(volunteerFilterHref(searchParams, "roleId", value))
            }
          >
            <SelectTrigger
              id="volunteer-role-filter"
              className="min-w-0 md:w-52"
            >
              <SelectValue placeholder="Todos los roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los roles</SelectItem>
              {!roleKnown && (
                <SelectItem value={roleId}>Rol #{roleId}</SelectItem>
              )}
              {roles.map((role) => (
                <SelectItem key={role.id} value={`${role.id}`}>
                  {inactive(role.isActive, role.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label
            htmlFor="volunteer-shift-filter"
            className="text-sm font-normal text-muted-foreground"
          >
            Turno
          </Label>
          <Select
            value={shiftId}
            onValueChange={(value) =>
              navigate(volunteerFilterHref(searchParams, "shiftId", value))
            }
          >
            <SelectTrigger
              id="volunteer-shift-filter"
              className="min-w-0 md:w-72"
            >
              <SelectValue placeholder="Todos los turnos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los turnos</SelectItem>
              {!shiftKnown && (
                <SelectItem value={shiftId}>Turno #{shiftId}</SelectItem>
              )}
              {shifts.map((shift) => (
                <SelectItem key={shift.id} value={`${shift.id}`}>
                  {inactive(
                    shift.isActive,
                    `${formatShiftWhen(shift)} — ${shift.label}`,
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start md:self-end"
          onClick={() => {
            setSearchKey((key) => key + 1);
            navigate(clearVolunteerFiltersHref(searchParams));
          }}
        >
          <XIcon aria-hidden="true" className="mr-1 h-4 w-4" />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
