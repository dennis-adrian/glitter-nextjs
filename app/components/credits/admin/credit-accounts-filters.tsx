"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/app/components/ui/button";
import Search from "@/app/components/ui/search";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  CREDIT_ACCOUNT_FILTER_LABELS,
  CREDIT_ACCOUNT_FILTERS,
  CREDIT_ACCOUNT_SORT_LABELS,
  CREDIT_ACCOUNT_SORTS,
  CreditAccountsSearchParamsSchema,
} from "@/app/lib/credits/admin-definitions";

export default function CreditAccountsFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { filter, sort, direction } = CreditAccountsSearchParamsSchema.parse({
    filter: searchParams.get("filter") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    direction: searchParams.get("direction") ?? undefined,
  });

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value == null) next.delete(key);
      else next.set(key, value);
    }
    next.set("offset", "0");
    startTransition(() => {
      router.push(`?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      className="flex flex-col gap-3 md:flex-row md:items-end"
      data-pending={isPending ? "" : undefined}
    >
      <Search
        className="md:flex-1"
        placeholder="Buscar por nombre, correo o #id"
        label="Buscar cuenta"
      />
      <div className="flex flex-wrap items-end gap-2">
        <Select
          value={filter}
          onValueChange={(value) =>
            update({ filter: value === "all" ? null : value })
          }
        >
          <SelectTrigger className="w-52" aria-label="Filtrar cuentas">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CREDIT_ACCOUNT_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {CREDIT_ACCOUNT_FILTER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => update({ sort: value })}>
          <SelectTrigger className="w-48" aria-label="Ordenar por">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CREDIT_ACCOUNT_SORTS.map((value) => (
              <SelectItem key={value} value={value}>
                Ordenar: {CREDIT_ACCOUNT_SORT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() =>
            update({ direction: direction === "desc" ? "asc" : "desc" })
          }
          aria-label={
            direction === "desc" ? "Orden descendente" : "Orden ascendente"
          }
          title={direction === "desc" ? "Mayor a menor" : "Menor a mayor"}
        >
          {direction === "desc" ? (
            <ArrowDownIcon className="h-4 w-4" />
          ) : (
            <ArrowUpIcon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
