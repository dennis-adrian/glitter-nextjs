"use client";

import { Button } from "@/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { formatDate } from "@/app/lib/formatters";
import {
  applyHistoricalOrderCosts,
  type HistoricalCostBackfillPreview,
  type OrdersProfitability,
} from "@/app/lib/orders/actions";
import { serializeCsvRows } from "@/app/lib/orders/csv";
import { DownloadIcon, HistoryIcon, Loader2Icon } from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { use, useState, useTransition } from "react";
import { toast } from "sonner";

const money = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
});

export default function ProfitabilityReport({
  reportPromise,
  historicalCostPreviewPromise,
}: {
  reportPromise: Promise<OrdersProfitability>;
  historicalCostPreviewPromise: Promise<HistoricalCostBackfillPreview>;
}) {
  const report = use(reportPromise);
  const preview = use(historicalCostPreviewPromise);
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const coverage =
    report.grossRevenue === 0
      ? 0
      : Math.round((report.knownCostRevenue / report.grossRevenue) * 100);

  function exportReport() {
    const headers = [
      "Pedido",
      "Fecha",
      "Producto",
      "Cantidad",
      "Ingresos (Bs)",
      "Costo (Bs)",
      "Utilidad (Bs)",
      "Estado",
    ];
    const rows = report.rows.map((row) => [
      row.orderId,
      formatDate(row.date).toISODate(),
      row.product,
      row.quantity,
      row.revenue.toFixed(2),
      row.cost?.toFixed(2) ?? "",
      row.profit?.toFixed(2) ?? "",
      row.status,
    ]);
    const csv = serializeCsvRows([headers, ...rows]);
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `rentabilidad-${DateTime.now().toISODate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function applyHistoricalCosts() {
    startTransition(async () => {
      const result = await applyHistoricalOrderCosts();
      if (result.success) {
        toast.success(result.message);
        setConfirmOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Rentabilidad de pedidos</h3>
          <p className="text-sm text-muted-foreground">
            Pedidos pagados y entregados · cobertura de costos {coverage}%
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportReport}>
          <DownloadIcon className="mr-2 h-4 w-4" />
          Exportar rentabilidad
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Ingresos" value={money.format(report.grossRevenue)} />
        <Metric
          label="Costo de productos"
          value={money.format(report.productCost)}
        />
        <Metric
          label="Utilidad bruta"
          value={money.format(report.grossProfit)}
          tone={report.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}
        />
      </div>
      {report.lineCount > 0 && coverage < 100 && (
        <p className="text-xs text-amber-700">
          Algunas líneas no tienen costo histórico; la utilidad está
          sobreestimada hasta completar esos costos.
        </p>
      )}

      {preview.missingLines > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <HistoryIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Completar costos históricos</p>
              <p className="text-xs text-amber-800">
                {preview.resolvableLines} de {preview.missingLines} líneas
                pueden usar los costos actuales · todos los pedidos
              </p>
              {preview.unresolvedLines > 0 && (
                <p className="text-xs text-amber-700">
                  {preview.unresolvedLines} líneas seguirán pendientes hasta que
                  agregues su costo de producto o variante.
                </p>
              )}
            </div>
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={preview.resolvableLines === 0 || isPending}
                className="shrink-0 border-amber-300 bg-white hover:bg-amber-100"
              >
                Aplicar costos actuales
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿Aplicar costos a todos los pedidos?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Se copiará el costo actual del producto o variante a{" "}
                  {preview.resolvableLines} líneas históricas. Solo se completan
                  costos vacíos; los costos ya guardados no cambian.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Pedidos afectados</p>
                  <p className="font-semibold">{preview.affectedOrders}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Costo estimado</p>
                  <p className="font-semibold">
                    {money.format(preview.estimatedCost)}
                  </p>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    applyHistoricalCosts();
                  }}
                >
                  {isPending && (
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Aplicar a todos
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
