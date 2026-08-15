import type { FastPassTransactionRow } from "@/app/lib/fast-pass/purchase-queries";
import {
  FAST_PASS_PAYMENT_METHOD_LABELS,
  FAST_PASS_TRANSACTION_TYPE_LABELS,
} from "@/app/lib/fast-pass/definitions";
import { formatDateWithTime } from "@/app/lib/formatters";
import { formatMoney } from "@/app/lib/programs/pricing";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import FastPassCancelSaleForm from "@/app/components/fast-pass/admin/cancel-sale-form";

type Props = {
  transactions: FastPassTransactionRow[];
};

export default function FastPassTransactionsTable({ transactions }: Props) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay transacciones registradas.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Compra</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead>Método</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Operador</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell>{transaction.id}</TableCell>
              <TableCell>{formatDateWithTime(transaction.createdAt)}</TableCell>
              <TableCell>
                {FAST_PASS_TRANSACTION_TYPE_LABELS[transaction.type]}
              </TableCell>
              <TableCell>#{transaction.purchaseId}</TableCell>
              <TableCell>{transaction.channelLabel}</TableCell>
              <TableCell>
                {FAST_PASS_PAYMENT_METHOD_LABELS[transaction.paymentMethod]}
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(transaction.amount)}
              </TableCell>
              <TableCell>{transaction.operatorLabel ?? "—"}</TableCell>
              <TableCell>
                {transaction.isCancellable ? (
                  <FastPassCancelSaleForm saleTransactionId={transaction.id} />
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
