"use client";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { STORE_CATEGORY_SCOPE_LABELS } from "@/app/lib/store/category";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const CATEGORY_OPTIONS = [
  { value: "all", label: STORE_CATEGORY_SCOPE_LABELS.all },
  { value: "merch", label: STORE_CATEGORY_SCOPE_LABELS.merch },
  { value: "supplies", label: STORE_CATEGORY_SCOPE_LABELS.supplies },
];

export default function HistoricalCategoryFilters() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") params.delete(key);
    else params.set(key, value);
    startTransition(() => {
      router.push(params.size ? `${pathname}?${params}` : pathname);
    });
  }

  return (
    <form
      key={searchParams.toString()}
      className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-3"
      onSubmit={(event) => event.preventDefault()}
      data-pending={isPending ? "" : undefined}
    >
      <div className="space-y-1.5">
        <Label htmlFor="historical-category-from">Desde</Label>
        <Input
          id="historical-category-from"
          type="date"
          defaultValue={searchParams.get("from") ?? ""}
          onChange={(event) => update("from", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historical-category-to">Hasta</Label>
        <Input
          id="historical-category-to"
          type="date"
          defaultValue={searchParams.get("to") ?? ""}
          onChange={(event) => update("to", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historical-category-order">Pedido</Label>
        <Input
          id="historical-category-order"
          inputMode="numeric"
          placeholder="ID de pedido"
          defaultValue={searchParams.get("orderId") ?? ""}
          onBlur={(event) => update("orderId", event.target.value.trim())}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historical-category-q">Producto</Label>
        <Input
          id="historical-category-q"
          placeholder="Buscar por nombre"
          defaultValue={searchParams.get("q") ?? ""}
          onBlur={(event) => update("q", event.target.value.trim())}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historical-category-snapshot">
          Categoría histórica
        </Label>
        <Select
          value={searchParams.get("snapshotCategory") ?? "all"}
          onValueChange={(value) => update("snapshotCategory", value)}
        >
          <SelectTrigger id="historical-category-snapshot">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historical-category-current">
          Categoría actual del producto
        </Label>
        <Select
          value={searchParams.get("currentProductCategory") ?? "all"}
          onValueChange={(value) => update("currentProductCategory", value)}
        >
          <SelectTrigger id="historical-category-current">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => startTransition(() => router.push(pathname))}
        >
          Limpiar filtros
        </Button>
      </div>
    </form>
  );
}
