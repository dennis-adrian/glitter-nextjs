import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassTransactionsTable from "@/app/components/fast-pass/admin/transactions-table";
import {
  fetchFastPassNotificationFailureCount,
  fetchFastPassTransactions,
} from "@/app/lib/fast-pass/purchase-queries";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatMoney } from "@/app/lib/programs/pricing";
import { requireFastPassFestivalAdmin } from "@/app/lib/fast-pass/admin-auth";
import { parseRouteId } from "@/app/lib/fast-pass/route-params";

export const metadata: Metadata = {
  title: "Pase Rápido — Transacciones",
};

export default async function FastPassTransactionsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const festivalId = parseRouteId(params.id);
  if (festivalId === null) notFound();

  const admin = await requireFastPassFestivalAdmin(festivalId);
  if (!admin) notFound();

  const [transactions, notificationFailures] = await Promise.all([
    fetchFastPassTransactions(festivalId),
    fetchFastPassNotificationFailureCount(festivalId),
  ]);
  const gross = transactions
    .filter((transaction) => transaction.type === "sale")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const refundedSaleIds = new Set(
    transactions
      .filter((transaction) => transaction.type === "refund")
      .map((transaction) => transaction.relatedTransactionId),
  );
  const cancelled = transactions
    .filter(
      (transaction) =>
        transaction.type === "cancellation" &&
        !refundedSaleIds.has(transaction.relatedTransactionId),
    )
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const refunded = transactions
    .filter((transaction) => transaction.type === "refund")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Libro de transacciones</h2>
        <p className="text-sm text-muted-foreground">
          Registro inmutable de ventas, cancelaciones y reembolsos.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Ventas brutas", formatMoney(gross)],
          ["Cancelado", formatMoney(cancelled)],
          ["Reembolsado", formatMoney(refunded)],
          ["Neto", formatMoney(gross - cancelled - refunded)],
          ["Notificaciones fallidas", String(notificationFailures)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>
      <FastPassTransactionsTable transactions={transactions} />
    </div>
  );
}
