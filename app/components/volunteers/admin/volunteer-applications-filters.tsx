"use client";

import { CirclePlusIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { toolbarButtonClass } from "@/app/components/ui/data_table/styles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Input } from "@/app/components/ui/input";
import {
  clearVolunteerFiltersHref,
  hasVolunteerFilters,
  roleFilterLabel,
  shiftFilterLabel,
  volunteerListHref,
  volunteerStatusHref,
} from "@/app/components/volunteers/admin/volunteer-admin-list-params";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { cn } from "@/app/lib/utils";
import {
  VOLUNTEER_STATUS_FILTER_LABELS,
  VOLUNTEER_STATUS_FILTERS,
  type VolunteerAdminRole,
  type VolunteerAdminShift,
  type VolunteerApplicationsFilters,
  type VolunteerApplicationsPage,
} from "@/app/lib/volunteers/admin-definitions";
import { formatShiftWhen } from "@/app/lib/volunteers/format";

/** The radio value for "no filter": Radix needs a non-empty one. */
const ALL = "all";

export type FacetOption = { value: string; label: string };

/**
 * A dashed toolbar button that narrows the list to one value of a URL
 * parameter, and shows that value as a badge once one is chosen.
 */
export function VolunteerFacetFilter({
  label,
  allLabel,
  options,
  value,
  valueLabel,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: FacetOption[];
  /** The chosen value, or undefined for none. */
  value?: string;
  /** What the badge says for `value`. */
  valueLabel?: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            toolbarButtonClass,
            "h-11 max-w-full min-w-0 border-dashed md:h-9",
          )}
        >
          <CirclePlusIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="shrink-0">
            {label}
            {value && <span className="sr-only">:</span>}
          </span>
          {value && (
            <Badge
              variant="secondary"
              className="ml-1 block min-w-0 shrink truncate"
            >
              {valueLabel}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={value ?? ALL}
          onValueChange={(next) => onChange(next === ALL ? null : next)}
        >
          <DropdownMenuRadioItem value={ALL}>{allLabel}</DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="break-words"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function inactive(isActive: boolean, label: string) {
  return isActive ? label : `${label} (inactivo)`;
}

function byStart(a: VolunteerAdminShift, b: VolunteerAdminShift) {
  return a.startsAt.getTime() - b.startsAt.getTime() || a.id - b.id;
}

/**
 * The "Postulaciones" card's controls: a chip per status with how many it
 * holds under the other filters, the search (name, phone or email), the
 * "Turno disponible" and "Rol preferido" filters and "Limpiar filtros".
 * Everything is URL state, so a filtered list can be shared or reloaded.
 */
export default function VolunteerApplicationsFilters({
  basePath,
  searchParams,
  filters,
  counts,
  roles,
  shifts,
}: {
  /** The list's path, without a query string. */
  basePath: string;
  /** The URL's query, as the page received it. */
  searchParams: RawSearchParams;
  /** The same query, as the server parsed it: what actually applies. */
  filters: VolunteerApplicationsFilters;
  counts: VolunteerApplicationsPage["counts"];
  roles: VolunteerAdminRole[];
  shifts: VolunteerAdminShift[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => router.push(href, { scroll: false }));
  }

  // Typed into directly and pushed to the URL after a pause, so a server
  // round trip never eats keystrokes; follows the URL when it changes from
  // elsewhere ("Limpiar filtros", a chip, the back button).
  const [search, setSearch] = useState(filters.query);
  const lastPushed = useRef(filters.query);
  useEffect(() => {
    if (filters.query !== lastPushed.current) {
      lastPushed.current = filters.query;
      setSearch(filters.query);
    }
  }, [filters.query]);
  const pushSearch = useDebouncedCallback((term: string) => {
    lastPushed.current = term;
    navigate(
      volunteerListHref(basePath, searchParams, { query: term || null }),
    );
  }, 400);

  const shiftOptions = [...shifts].sort(byStart).map((shift) => ({
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
    <div className="flex min-w-0 flex-col gap-3">
      <nav
        aria-label="Estado de las postulaciones"
        className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {VOLUNTEER_STATUS_FILTERS.map((status) => {
          const active = status === filters.status;
          return (
            <Link
              key={status}
              href={volunteerStatusHref(basePath, searchParams, status)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none md:min-h-7",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground hover:bg-muted",
              )}
            >
              {VOLUNTEER_STATUS_FILTER_LABELS[status]}{" "}
              <span className="tabular-nums">{counts[status]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-start">
        <div className="relative w-full min-w-0 md:max-w-sm md:flex-1 md:basis-60">
          <label htmlFor="volunteer-search" className="sr-only">
            Buscar postulaciones
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="volunteer-search"
            type="search"
            value={search}
            placeholder="Buscar por nombre, celular o correo"
            onChange={(event) => {
              setSearch(event.target.value);
              pushSearch(event.target.value.trim());
            }}
            className="h-11 pl-9 md:h-9"
            aria-busy={isPending || undefined}
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          <VolunteerFacetFilter
            label="Turno disponible"
            allLabel="Todos los turnos"
            options={shiftOptions}
            value={filters.shiftId ? `${filters.shiftId}` : undefined}
            valueLabel={
              filters.shiftId
                ? shiftFilterLabel(shifts, filters.shiftId)
                : undefined
            }
            onChange={(value) =>
              navigate(
                volunteerListHref(basePath, searchParams, { shiftId: value }),
              )
            }
          />
          <VolunteerFacetFilter
            label="Rol preferido"
            allLabel="Todos los roles"
            options={roleOptions}
            value={filters.roleId ? `${filters.roleId}` : undefined}
            valueLabel={
              filters.roleId
                ? roleFilterLabel(roles, filters.roleId)
                : undefined
            }
            onChange={(value) =>
              navigate(
                volunteerListHref(basePath, searchParams, { roleId: value }),
              )
            }
          />
          {hasVolunteerFilters(filters) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 md:h-9"
              onClick={() => {
                pushSearch.cancel();
                navigate(clearVolunteerFiltersHref(basePath, searchParams));
              }}
            >
              <XIcon aria-hidden="true" className="mr-1 h-4 w-4" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
