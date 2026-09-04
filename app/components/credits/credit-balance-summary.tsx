import { AlertCircleIcon, CoinsIcon } from "lucide-react";

import BuyDebtCreditsButton from "@/app/components/credits/buy-debt-credits-button";
import { formatCreditCount } from "@/app/components/credits/credit-amount";
import ReleaseFeatureCreditsButton from "@/app/components/credits/release-feature-credits-button";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Separator } from "@/app/components/ui/separator";
import { type CreditBalances } from "@/app/lib/credits/balances";
import { type FeatureHold } from "@/app/lib/credits/queries";

type CreditBalanceSummaryProps = {
  balances: CreditBalances;
  /** Open earmarks this participant can hand back. */
  activeHolds?: FeatureHold[];
};

/**
 * One spendable balance, with what is reserved and what is owed kept apart.
 *
 * Credits are usable the moment their voucher is submitted, wherever they are
 * spent. A voucher that cannot be confirmed is reversed, which leaves the
 * account in debt for an admin to resolve — the money is recovered afterwards
 * rather than withheld beforehand.
 *
 * Three states look identical in a raw spendable balance and are not the same
 * thing at all: credits reserved against a feature are still the
 * participant's and come back on release; a reservation whose credits were
 * reversed owes nothing yet but returns nothing either, and only turns into a
 * debt if it is used; a negative ledger is money that has to be settled.
 * Showing the raw figure told someone holding an unused reservation they were
 * 20 credits in the red.
 */
export default function CreditBalanceSummary({
  balances,
  activeHolds = [],
}: CreditBalanceSummaryProps) {
  const debt = Math.max(0, -balances.ledgerBalance);
  // Floored: what is reserved is subtracted below and explained on its own.
  // Only a negative ledger is a debt, and it has its own alert.
  const available = Math.max(0, balances.spendableBalance);

  // A reservation outlives the credits that paid for it when the voucher
  // behind them is rejected: the ledger goes back to zero while the hold
  // stays. Nothing is owed yet — a hold posts no entry, only its capture
  // does — but the two states cannot share copy. Releasing a backed hold
  // gives the credits back; releasing this one gives nothing back, and using
  // it is what would create the debt.
  const unbackedHolds = Math.max(
    0,
    balances.activeHolds - Math.max(0, balances.ledgerBalance),
  );

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
          <p className="text-3xl font-bold">{formatCreditCount(available)}</p>
          <p className="text-sm text-muted-foreground">
            Disponibles para usar ahora
          </p>
        </div>

        <Separator />

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Saldo total</dt>
            <dd>{formatCreditCount(balances.ledgerBalance)}</dd>
          </div>
          {balances.activeHolds > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                Reservados para una función
              </dt>
              <dd>{formatCreditCount(balances.activeHolds)}</dd>
            </div>
          )}
          {balances.underReviewIssuance > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">En revisión</dt>
              <dd>{formatCreditCount(balances.underReviewIssuance)}</dd>
            </div>
          )}
        </dl>

        {/* Reported, not withheld: credits are spendable from the moment their
            voucher is submitted, so this says where they are, not what they
            cannot do. */}
        {balances.underReviewIssuance > 0 && (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Tenés {formatCreditCount(balances.underReviewIssuance)} en revisión.
            Ya podés usarlos; si algún comprobante no se puede confirmar, te
            avisamos.
          </p>
        )}

        {/* The reserved credits are still theirs, and this is the only place
            outside the festival's map that says so or lets them take them
            back. */}
        {activeHolds.length > 0 && (
          <div
            className={
              unbackedHolds > 0
                ? "space-y-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900"
                : "space-y-3 rounded-md bg-muted p-3 text-sm"
            }
          >
            <p className={unbackedHolds > 0 ? "" : "text-muted-foreground"}>
              {unbackedHolds > 0 ? (
                <>
                  Activaste la mesa completa con créditos que después no pudimos
                  confirmar. Todavía no debés nada. Si liberás la activación no
                  vas a deber nada; si la usás para reservar, vas a quedar
                  debiendo {formatCreditCount(unbackedHolds)}.
                </>
              ) : (
                <>
                  Tenés {formatCreditCount(balances.activeHolds)} reservados
                  porque activaste la mesa completa. Siguen siendo tuyos: si ya
                  no la querés, liberalos y volvés a tenerlos disponibles.
                </>
              )}
            </p>
            {activeHolds.map((hold) => (
              <ReleaseFeatureCreditsButton
                key={hold.featureActionId}
                festivalId={hold.festivalId}
                label={
                  unbackedHolds > 0
                    ? `Liberar la mesa completa de ${hold.festivalName}`
                    : `Liberar ${formatCreditCount(hold.amount)} de ${hold.festivalName}`
                }
              />
            ))}
          </div>
        )}

        {debt > 0 && (
          <Alert variant="destructive">
            <AlertCircleIcon className="h-4 w-4" />
            <AlertTitle>Tenés un saldo pendiente</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                Rechazamos un comprobante después de que usaste esos créditos,
                así que quedaste debiendo {formatCreditCount(debt)}. No vas a
                poder usar créditos hasta regularizarlo. Lo que pagaste con esos
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
