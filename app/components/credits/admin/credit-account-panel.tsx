import { CoinsIcon } from "lucide-react";

import CreditAmount, {
  formatCreditCount,
} from "@/app/components/credits/credit-amount";
import CreditAdjustButton from "@/app/components/credits/admin/credit-adjust-button";
import CreditRevertButton from "@/app/components/credits/admin/credit-revert-button";
import ReleaseFeatureCreditsButton from "@/app/components/credits/release-feature-credits-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  fetchCreditWallet,
  fetchFeatureHolds,
} from "@/app/lib/credits/queries";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const TYPE_LABELS = {
  top_up: "Compra de créditos",
  spend: "Uso de créditos",
  reversal: "Reversión por comprobante rechazado",
  admin_grant: "Créditos otorgados",
  admin_adjustment: "Ajuste administrativo",
} as const;

/** How many movements are worth showing beside a balance, before it stops being a summary. */
const RECENT_ENTRY_LIMIT = 5;

/**
 * A participant's credit account, as seen from their admin profile.
 *
 * It exists so granting credits starts from the person rather than from a
 * search box, and so the grant lands next to the history it will appear in —
 * every adjustment is a ledger entry the participant reads in their own wallet.
 */
export default async function CreditAccountPanel({
  userId,
  participantName,
}: {
  userId: number;
  participantName: string;
}) {
  // Credits are still behind a flag; with it off, an account nobody can see
  // has no balance worth reporting here either.
  if (!(await isFeatureEnabled("credits"))) return null;

  const [actor, wallet, holds] = await Promise.all([
    getCurrentUserProfile(),
    fetchCreditWallet(userId),
    fetchFeatureHolds(userId),
  ]);
  if (!wallet) return null;

  const activeHolds = holds.filter((hold) => hold.status === "active");

  const canAdjust = canMutateAdminReservations(actor);
  const recentEntries = wallet.entries.slice(0, RECENT_ENTRY_LIMIT);
  const inDebt = wallet.balances.ledgerBalance < 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CoinsIcon className="h-5 w-5 text-amber-500" />
          Créditos
        </CardTitle>
        <CreditAdjustButton
          userId={userId}
          participantName={participantName}
          canAdjust={canAdjust}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Saldo disponible</dt>
          <dd className="text-right font-medium">
            <CreditAmount amount={wallet.balances.spendableBalance} />
          </dd>
          <dt className="text-muted-foreground">Saldo en el libro</dt>
          <dd className={inDebt ? "text-right text-red-600" : "text-right"}>
            <CreditAmount amount={wallet.balances.ledgerBalance} />
          </dd>
          {wallet.balances.activeHolds > 0 && (
            <>
              <dt className="text-muted-foreground">Retenido</dt>
              <dd className="text-right">
                <CreditAmount amount={wallet.balances.activeHolds} />
              </dd>
            </>
          )}
          {wallet.balances.underReviewIssuance > 0 && (
            <>
              <dt className="text-muted-foreground">En revisión</dt>
              <dd className="text-right">
                <CreditAmount amount={wallet.balances.underReviewIssuance} />
              </dd>
            </>
          )}
        </dl>

        {/* An activation only the participant could undo is unreachable once
            they stop coming back — and the one whose voucher was rejected has
            the least reason to. Releasing posts no entry either way; it hands
            the earmarked credits back. */}
        {activeHolds.length > 0 && (
          <div className="space-y-2 rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              Tiene la mesa completa activada. Liberarla devuelve los créditos
              reservados a su saldo disponible.
            </p>
            {activeHolds.map((hold) => (
              <ReleaseFeatureCreditsButton
                key={hold.featureActionId}
                userId={userId}
                festivalId={hold.festivalId}
                label={`Liberar ${formatCreditCount(hold.amount)} de ${hold.festivalName}`}
              />
            ))}
            {!canAdjust && (
              <p className="text-xs text-muted-foreground">
                Solo un administrador general puede liberarla.
              </p>
            )}
          </div>
        )}

        {recentEntries.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Últimos movimientos
            </p>
            <ul className="divide-y">
              {recentEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm">{TYPE_LABELS[entry.type]}</p>
                    {entry.reason && (
                      <p className="text-xs text-muted-foreground">
                        {entry.reason}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDateWithTime(entry.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <CreditAmount
                      amount={entry.amount}
                      signed
                      className={
                        entry.amount > 0
                          ? "text-sm font-medium text-green-600"
                          : "text-sm font-medium"
                      }
                    />
                    {/* Only an admin's own entry is undoable from here. A
                        top-up is undone by rejecting its voucher and a spend
                        by whatever booked it, so offering the control on those
                        would promise something the service refuses. */}
                    {canAdjust &&
                      (entry.type === "admin_grant" ||
                        entry.type === "admin_adjustment") &&
                      (entry.isReverted ? (
                        <span className="text-xs text-muted-foreground">
                          Revertido
                        </span>
                      ) : (
                        <CreditRevertButton
                          userId={userId}
                          entryId={entry.id}
                          amount={entry.amount}
                        />
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
