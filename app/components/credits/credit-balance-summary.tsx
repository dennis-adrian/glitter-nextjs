import { AlertCircleIcon, CoinsIcon } from "lucide-react";

import BuyDebtCreditsButton from "@/app/components/credits/buy-debt-credits-button";
import CreditAmount, {
  formatCredits,
} from "@/app/components/credits/credit-amount";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Separator } from "@/app/components/ui/separator";
import { type CreditBalances } from "@/app/lib/credits/balances";

type CreditBalanceSummaryProps = {
  balances: CreditBalances;
};

/**
 * Provisional and confirmed money are separated on purpose: credits from a
 * voucher we have not reviewed yet can pay for optional features, but never a
 * reservation invoice.
 */
export default function CreditBalanceSummary({
  balances,
}: CreditBalanceSummaryProps) {
  const debt = Math.max(0, -balances.ledgerBalance);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CoinsIcon className="h-5 w-5 text-amber-500" />
          Mis créditos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-bold">
            <CreditAmount amount={balances.spendableBalance} />
          </p>
          <p className="text-sm text-muted-foreground">
            Disponible para usar ahora
          </p>
        </div>

        <Separator />

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Saldo total</dt>
            <dd>
              <CreditAmount amount={balances.ledgerBalance} />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Reservado para una función</dt>
            <dd>
              <CreditAmount amount={balances.activeHolds} />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              Disponible para pagar una reserva
            </dt>
            <dd>
              <CreditAmount amount={balances.invoiceEligibleBalance} />
            </dd>
          </div>
          {balances.underReviewIssuance > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">En revisión</dt>
              <dd>
                <CreditAmount amount={balances.underReviewIssuance} />
              </dd>
            </div>
          )}
        </dl>

        {balances.underReviewIssuance > 0 && (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Tenés {formatCredits(balances.underReviewIssuance)} en revisión.
            Podés usarlos en funciones opcionales, pero recién vas a poder
            aplicarlos al pago de una reserva cuando aprobemos tu comprobante.
          </p>
        )}

        {debt > 0 && (
          <Alert variant="destructive">
            <AlertCircleIcon className="h-4 w-4" />
            <AlertTitle>Tenés un saldo pendiente</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                Rechazamos un comprobante después de que usaste esos créditos,
                así que quedaste debiendo {formatCredits(debt)}. No vas a poder
                usar créditos hasta regularizarlo. Lo que pagaste con esos
                créditos sigue en pie: nada se cancela por este saldo.
              </p>
              <BuyDebtCreditsButton debtAmount={debt} />
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
