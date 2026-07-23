"use client";

import { ComboboxPopover } from "@/app/components/ui/combobox";
import { MultipleSelectCombobox } from "@/app/components/ui/multiselect-combobox";
import Search from "@/app/components/ui/search";
import SearchInput from "@/app/components/ui/search-input/input";
import type { SearchOption } from "@/app/components/ui/search-input/search-content";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { InfractionSearchParamsSchema } from "@/app/dashboard/infractions/schemas";
import { searchUsersForInfraction } from "@/app/lib/infractions/actions";
import {
  infractionSeverityLabel,
  infractionStatusLabel,
  participantDisplayName,
} from "@/app/lib/infractions/mappers";
import { InfractionType } from "@/app/lib/infractions/definitions";
import { SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type FestivalOption = {
  id: number;
  name: string;
};

type InfractionsFiltersProps = {
  infractionTypes: InfractionType[];
  festivals: FestivalOption[];
};

export default function InfractionsFilters({
  infractionTypes,
  festivals,
}: InfractionsFiltersProps) {
  const searchParams = useSearchParams();
  const { push } = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userOptions, setUserOptions] = useState<SearchOption[]>([]);
  const [selectedUserLabel, setSelectedUserLabel] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSearching, startSearch] = useTransition();

  const statusParams = searchParams.getAll("status");
  const severityParams = searchParams.getAll("severity");

  const parsed = InfractionSearchParamsSchema.safeParse({
    query: searchParams.get("query") || undefined,
    userId: searchParams.get("userId") || undefined,
    festivalId: searchParams.get("festivalId") || undefined,
    festivalType: searchParams.get("festivalType") || undefined,
    typeId: searchParams.get("typeId") || undefined,
    severity:
      severityParams.length === 0
        ? undefined
        : severityParams.length === 1
          ? severityParams[0]
          : severityParams,
    status:
      statusParams.length === 0
        ? undefined
        : statusParams.length === 1
          ? statusParams[0]
          : statusParams,
    userGaveNotice: searchParams.get("userGaveNotice") || undefined,
    hasSanction: searchParams.get("hasSanction") || undefined,
    sanctionStatus: searchParams.get("sanctionStatus") || undefined,
    createdFrom: searchParams.get("createdFrom") || undefined,
    createdTo: searchParams.get("createdTo") || undefined,
    resolvedFrom: searchParams.get("resolvedFrom") || undefined,
    sort: searchParams.get("sort") || undefined,
    direction: searchParams.get("direction") || undefined,
    limit: searchParams.get("limit") || undefined,
    offset: searchParams.get("offset") || undefined,
  });

  if (!parsed.success) return null;

  const {
    status = [],
    severity = [],
    festivalId,
    typeId,
    userGaveNotice,
    hasSanction,
    festivalType,
    userId,
    sanctionStatus,
    createdFrom,
    createdTo,
    resolvedFrom,
    sort,
    direction,
  } = parsed.data;

  const statusOptions = Object.entries(infractionStatusLabel).map(
    ([value, label]) => ({ value, label }),
  );
  const severityOptions = Object.entries(infractionSeverityLabel).map(
    ([value, label]) => ({ value, label }),
  );
  const typeOptions = infractionTypes.map((type) => ({
    value: String(type.id),
    label: type.label,
  }));
  const festivalOptions = [
    { value: "none", label: "Sin festival (global)" },
    ...festivals.map((festival) => ({
      value: String(festival.id),
      label: festival.name,
    })),
  ];

  const handleFilterSelect = (filter: string, values: string[]) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(filter);
    values.filter(Boolean).forEach((value) => next.append(filter, value));
    next.set("offset", "0");
    startTransition(() => {
      push(`?${next.toString()}`, { scroll: false });
    });
  };

  const handleSingleFilter = (filter: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") {
      next.delete(filter);
    } else {
      next.set(filter, value);
    }
    next.set("offset", "0");
    startTransition(() => {
      push(`?${next.toString()}`, { scroll: false });
    });
  };

  const handleClearFilter = (filter: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(filter);
    next.set("offset", "0");
    if (filter === "userId") setSelectedUserLabel("");
    startTransition(() => {
      push(`?${next.toString()}`, { scroll: false });
    });
  };

  const handleUserSearch = (term: string) => {
    startSearch(async () => {
      const users = await searchUsersForInfraction(term);
      setUserOptions(
        users.map((user) => ({
          value: user.id,
          label: `${participantDisplayName(user)} · ${user.email}`,
        })),
      );
    });
  };

  const chips: { key: string; label: string }[] = [
    ...(userId
      ? [
          {
            key: "userId",
            label: selectedUserLabel || `Participante #${userId}`,
          },
        ]
      : []),
    ...(status.length
      ? [
          {
            key: "status",
            label: `Estado: ${status.map((s) => infractionStatusLabel[s]).join(", ")}`,
          },
        ]
      : []),
    ...(severity.length
      ? [
          {
            key: "severity",
            label: `Severidad: ${severity.map((s) => infractionSeverityLabel[s]).join(", ")}`,
          },
        ]
      : []),
    ...(typeId
      ? [
          {
            key: "typeId",
            label: `Tipo: ${infractionTypes.find((t) => t.id === typeId)?.label ?? typeId}`,
          },
        ]
      : []),
    ...(festivalId != null
      ? [
          {
            key: "festivalId",
            label:
              festivalId === "none"
                ? "Festival: Global"
                : `Festival: ${festivals.find((f) => f.id === festivalId)?.name ?? festivalId}`,
          },
        ]
      : []),
    ...(userGaveNotice != null
      ? [
          {
            key: "userGaveNotice",
            label: userGaveNotice ? "Con aviso previo" : "Sin aviso previo",
          },
        ]
      : []),
    ...(hasSanction != null
      ? [
          {
            key: "hasSanction",
            label: hasSanction ? "Con sanción" : "Sin sanción",
          },
        ]
      : []),
    ...(festivalType
      ? [{ key: "festivalType", label: `Marca: ${festivalType}` }]
      : []),
    ...(sanctionStatus
      ? [
          {
            key: "sanctionStatus",
            label: `Sanción: ${
              {
                scheduled: "programada",
                active: "activa",
                expired: "expirada",
                revoked: "revocada",
              }[sanctionStatus] ?? sanctionStatus
            }`,
          },
        ]
      : []),
    ...(createdFrom
      ? [{ key: "createdFrom", label: `Registrada desde: ${createdFrom}` }]
      : []),
    ...(createdTo
      ? [{ key: "createdTo", label: `Registrada hasta: ${createdTo}` }]
      : []),
    ...(resolvedFrom
      ? [{ key: "resolvedFrom", label: `Resuelta desde: ${resolvedFrom}` }]
      : []),
    ...(sort !== "createdAt" ? [{ key: "sort", label: "Orden: estado" }] : []),
    ...(direction !== "desc"
      ? [{ key: "direction", label: "Dirección: ascendente" }]
      : []),
  ];

  const filterControls = (
    <>
      <MultipleSelectCombobox
        defaultValue={status}
        label="Estado"
        name="status"
        options={statusOptions}
        onSelect={handleFilterSelect}
      />
      <MultipleSelectCombobox
        defaultValue={severity}
        label="Severidad"
        name="severity"
        options={severityOptions}
        onSelect={handleFilterSelect}
      />
      <ComboboxPopover
        defaultValue={typeId ? String(typeId) : "all"}
        label="Tipo"
        name="typeId"
        placeholder="Todos"
        options={[{ value: "all", label: "Todos" }, ...typeOptions]}
        onSelect={(_, values) => handleSingleFilter("typeId", values[0] ?? "")}
      />
      <ComboboxPopover
        defaultValue={
          festivalId == null
            ? "all"
            : festivalId === "none"
              ? "none"
              : String(festivalId)
        }
        label="Festival"
        name="festivalId"
        placeholder="Todos"
        options={[{ value: "all", label: "Todos" }, ...festivalOptions]}
        onSelect={(_, values) =>
          handleSingleFilter("festivalId", values[0] ?? "")
        }
      />
      <ComboboxPopover
        defaultValue={
          userGaveNotice == null ? "all" : userGaveNotice ? "true" : "false"
        }
        label="Aviso previo"
        name="userGaveNotice"
        placeholder="Todos"
        options={[
          { value: "all", label: "Todos" },
          { value: "true", label: "Con aviso" },
          { value: "false", label: "Sin aviso" },
        ]}
        onSelect={(_, values) =>
          handleSingleFilter("userGaveNotice", values[0] ?? "")
        }
      />
      <ComboboxPopover
        defaultValue={
          hasSanction == null ? "all" : hasSanction ? "true" : "false"
        }
        label="Sanción"
        name="hasSanction"
        placeholder="Todos"
        options={[
          { value: "all", label: "Todos" },
          { value: "true", label: "Con sanción" },
          { value: "false", label: "Sin sanción" },
        ]}
        onSelect={(_, values) =>
          handleSingleFilter("hasSanction", values[0] ?? "")
        }
      />
      <ComboboxPopover
        defaultValue={festivalType ?? "all"}
        label="Marca"
        name="festivalType"
        placeholder="Todas"
        options={[
          { value: "all", label: "Todas" },
          { value: "glitter", label: "Glitter" },
          { value: "festicker", label: "Festicker" },
          { value: "twinkler", label: "Twinkler" },
        ]}
        onSelect={(_, values) =>
          handleSingleFilter("festivalType", values[0] ?? "")
        }
      />
      <ComboboxPopover
        defaultValue={sanctionStatus ?? "all"}
        label="Estado sanción"
        name="sanctionStatus"
        placeholder="Todos"
        options={[
          { value: "all", label: "Todos" },
          { value: "scheduled", label: "Programada" },
          { value: "active", label: "Activa" },
          { value: "expired", label: "Expirada" },
          { value: "revoked", label: "Revocada" },
        ]}
        onSelect={(_, values) =>
          handleSingleFilter("sanctionStatus", values[0] ?? "")
        }
      />
      <ComboboxPopover
        defaultValue={sort}
        label="Ordenar por"
        name="sort"
        placeholder="Fecha"
        options={[
          { value: "createdAt", label: "Fecha" },
          { value: "status", label: "Estado" },
        ]}
        onSelect={(_, values) => handleSingleFilter("sort", values[0] ?? "")}
      />
      <ComboboxPopover
        defaultValue={direction}
        label="Dirección"
        name="direction"
        placeholder="Descendente"
        options={[
          { value: "desc", label: "Descendente" },
          { value: "asc", label: "Ascendente" },
        ]}
        onSelect={(_, values) =>
          handleSingleFilter("direction", values[0] ?? "")
        }
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        Registrada desde
        <Input
          className="h-9 w-auto text-foreground"
          type="date"
          value={createdFrom ?? ""}
          onChange={(event) =>
            handleSingleFilter("createdFrom", event.target.value)
          }
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        Registrada hasta
        <Input
          className="h-9 w-auto text-foreground"
          type="date"
          value={createdTo ?? ""}
          onChange={(event) =>
            handleSingleFilter("createdTo", event.target.value)
          }
        />
      </label>
    </>
  );

  return (
    <div
      className={`flex flex-col gap-3 ${isPending ? "opacity-70" : ""}`}
      data-pending={isPending || undefined}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Search placeholder="Buscar participante, tipo, festival o detalle" />
        <div className="w-full sm:max-w-96">
          <SearchInput
            id="infraction-user-filter"
            placeholder="Filtrar por participante"
            options={userOptions}
            isLoading={isSearching}
            onSearch={handleUserSearch}
            onSelect={(selectedUserId) => {
              const option = userOptions.find(
                (item) => Number(item.value) === selectedUserId,
              );
              setSelectedUserLabel(
                option?.label ?? `Participante #${selectedUserId}`,
              );
              handleSingleFilter("userId", String(selectedUserId));
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="sm:hidden"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontalIcon className="w-4 h-4 mr-2" />
          Filtros
        </Button>
      </div>

      <div className="hidden sm:flex flex-wrap gap-2">{filterControls}</div>
      {filtersOpen && (
        <div className="flex flex-col gap-2 sm:hidden">{filterControls}</div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="gap-1 pr-1 font-normal"
            >
              {chip.label}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted"
                onClick={() => handleClearFilter(chip.key)}
                aria-label={`Quitar filtro ${chip.label}`}
              >
                <XIcon className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
