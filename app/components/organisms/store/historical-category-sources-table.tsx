"use client";

import HistoricalCategoryCorrectionDialog from "@/app/components/organisms/store/historical-category-correction-dialog";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { formatDate } from "@/app/lib/formatters";
import {
  correctHistoricalLineCategoriesAction,
  type HistoricalLineCategorySource,
} from "@/app/lib/orders/actions";
import {
  getStoreCategoryBadgeLabel,
  getStoreCategoryScopeLabel,
  type StoreCategory,
} from "@/app/lib/store/category";
import { DateTime } from "luxon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

const MAX_SOURCES = 100;

export default function HistoricalCategorySourcesTable({
  sources,
}: {
  sources: HistoricalLineCategorySource[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [previousSources, setPreviousSources] = useState(sources);
  const [targetCategory, setTargetCategory] = useState<StoreCategory | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  // A new result set invalidates the previous selection's row identities.
  if (sources !== previousSources) {
    setPreviousSources(sources);
    setSelected([]);
  }

  const sourcesByKey = new Map(
    sources.map((source) => [source.sourceKey, source]),
  );
  const selectedSources = selected
    .map((key) => sourcesByKey.get(key))
    .filter((source): source is HistoricalLineCategorySource => source != null);
  const allSelected =
    sources.length > 0 &&
    selected.length === Math.min(sources.length, MAX_SOURCES);

  function toggle(sourceKey: string) {
    setSelected((current) =>
      current.includes(sourceKey)
        ? current.filter((key) => key !== sourceKey)
        : current.length >= MAX_SOURCES
          ? current
          : [...current, sourceKey],
    );
  }

  function toggleAll() {
    setSelected(
      allSelected
        ? []
        : sources.slice(0, MAX_SOURCES).map((source) => source.sourceKey),
    );
  }

  function submit() {
    if (!targetCategory) return;
    startTransition(async () => {
      const result = await correctHistoricalLineCategoriesAction({
        targetCategory,
        reason: reason.trim(),
        sources: selectedSources.map((source) => ({
          sourceKey: source.sourceKey,
          orderId: source.orderId,
          expectedOrderRevision: source.orderRevision,
          expectedCategory: source.snapshotCategory,
        })),
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setTargetCategory(null);
      setReason("");
      setSelected([]);
      router.refresh();
    });
  }

  if (sources.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center">
        <p className="text-sm font-medium">No hay líneas para revisar</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ajusta los filtros para ampliar el rango de fechas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3">
        <p className="text-sm text-muted-foreground">
          {selected.length} de {sources.length} líneas seleccionadas
          {selected.length >= MAX_SOURCES
            ? ` (máximo ${MAX_SOURCES} por corrección)`
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selected.length === 0 || isPending}
            onClick={() => setTargetCategory("merch")}
          >
            Marcar como {getStoreCategoryScopeLabel("merch")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selected.length === 0 || isPending}
            onClick={() => setTargetCategory("supplies")}
          >
            Marcar como {getStoreCategoryScopeLabel("supplies")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Seleccionar todas las líneas"
                />
              </TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead className="min-w-56">Producto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Categoría histórica</TableHead>
              <TableHead>Categoría actual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => {
              const isSelected = selected.includes(source.sourceKey);
              const mismatched =
                source.snapshotCategory !== source.currentProductCategory;
              return (
                <TableRow key={source.sourceKey}>
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(source.sourceKey)}
                      aria-label={`Seleccionar ${source.productLabel} del pedido ${source.orderId}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/dashboard/store/orders/${source.orderId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      #{source.orderId}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(source.orderDate).toLocaleString(
                        DateTime.DATE_MED,
                      )}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {source.sourceType === "base" ? "Original" : "Agregado"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {source.productLabel}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {source.quantity}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {getStoreCategoryBadgeLabel(source.snapshotCategory)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={mismatched ? "destructive" : "outline"}>
                      {getStoreCategoryBadgeLabel(
                        source.currentProductCategory,
                      )}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <HistoricalCategoryCorrectionDialog
        targetCategory={targetCategory}
        sourceCount={selectedSources.length}
        reason={reason}
        isPending={isPending}
        onReasonChange={setReason}
        onOpenChange={() => setTargetCategory(null)}
        onConfirm={submit}
      />
    </div>
  );
}
