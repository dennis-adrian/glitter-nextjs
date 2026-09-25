"use client";

import { XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { MultipleSelectCombobox } from "@/app/components/ui/multiselect-combobox";
import Search from "@/app/components/ui/search";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  CREDIT_LEDGER_KIND_LABELS,
  CREDIT_LEDGER_KINDS,
  CreditLedgerSearchParamsSchema,
} from "@/app/lib/credits/admin-definitions";

const KIND_OPTIONS = CREDIT_LEDGER_KINDS.map((value) => ({
  value,
  label: CREDIT_LEDGER_KIND_LABELS[value],
}));

/** Keys this component owns; clearing them leaves pagination size alone. */
const FILTER_KEYS = ["query", "kind", "festivalId", "from", "to"] as const;

export default function CreditLedgerFilters({
  festivals,
  showSearch = true,
}: {
  festivals: { id: number; name: string }[];
  /** Off on a single account's page, where the person is already chosen. */
  showSearch?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const kindParams = searchParams.getAll("kind");
  const { kind, festivalId, from, to } = CreditLedgerSearchParamsSchema.parse({
    kind: kindParams.length > 1 ? kindParams : (kindParams[0] ?? undefined),
    festivalId: searchParams.get("festivalId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  const hasFilters = FILTER_KEYS.some((key) => searchParams.has(key));

  function push(next: URLSearchParams) {
    next.set("offset", "0");
    startTransition(() => {
      router.push(`?${next.toString()}`, { scroll: false });
    });
  }

  function setSingle(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }

  function setKinds(values: string[]) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("kind");
    for (const value of values) next.append("kind", value);
    push(next);
  }

  function clear() {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) next.delete(key);
    push(next);
  }

  return (
    <div
      className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
      data-pending={isPending ? "" : undefined}
    >
      {showSearch && (
        <Search
          className="lg:w-80"
          placeholder="Buscar participante por nombre, correo o #id"
          label="Buscar participante"
        />
      )}
      <div className="flex flex-wrap items-end gap-2">
        <MultipleSelectCombobox
          label="Tipo"
          name="kind"
          options={KIND_OPTIONS}
          defaultValue={kind}
          onSelect={(_name, values) => setKinds(values)}
        />
        <Select
          value={festivalId ? String(festivalId) : "all"}
          onValueChange={(value) =>
            setSingle("festivalId", value === "all" ? null : value)
          }
        >
          <SelectTrigger className="w-56" aria-label="Festival">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los festivales</SelectItem>
            {festivals.map((festival) => (
              <SelectItem key={festival.id} value={String(festival.id)}>
                {festival.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Desde
          <Input
            type="date"
            className="w-40"
            value={from ?? ""}
            max={to}
            onChange={(event) => setSingle("from", event.target.value || null)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Hasta
          <Input
            type="date"
            className="w-40"
            value={to ?? ""}
            min={from}
            onChange={(event) => setSingle("to", event.target.value || null)}
          />
        </label>
        {hasFilters && (
          <Button type="button" variant="ghost" onClick={clear}>
            <XIcon className="mr-1 h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
