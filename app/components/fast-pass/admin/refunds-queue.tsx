import FastPassResolveRefundForm from "@/app/components/fast-pass/admin/resolve-refund-form";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type { FastPassRefundRow } from "@/app/lib/fast-pass/purchase-queries";
import { FAST_PASS_PAYMENT_METHOD_LABELS } from "@/app/lib/fast-pass/definitions";
import { formatDateWithTime } from "@/app/lib/formatters";
import { formatMoney } from "@/app/lib/programs/pricing";

const REFUND_STATUS_LABELS = {
  pending: "Pendiente",
  paid: "Pagado",
} as const;

type Props = {
  refunds: FastPassRefundRow[];
};

export default function FastPassRefundsQueue({ refunds }: Props) {
  if (refunds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay reembolsos pendientes por cancelación de festival.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {refunds.map((refund) => (
        <Card key={refund.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Reembolso #{refund.id}</CardTitle>
                <CardDescription>
                  Compra #{refund.purchaseId} · {refund.buyerName} ·{" "}
                  {refund.buyerEmail}
                </CardDescription>
              </div>
              <Badge
                variant={refund.status === "pending" ? "secondary" : "default"}
              >
                {REFUND_STATUS_LABELS[refund.status]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Monto: </span>
              {formatMoney(refund.amount)}
            </div>
            <div>
              <span className="text-muted-foreground">Método: </span>
              {FAST_PASS_PAYMENT_METHOD_LABELS[refund.paymentMethod]}
            </div>
            <div>
              <span className="text-muted-foreground">Registrado: </span>
              {formatDateWithTime(refund.createdAt)}
            </div>
            {refund.status === "pending" ? (
              <div className="sm:col-span-2">
                <FastPassResolveRefundForm refundId={refund.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
