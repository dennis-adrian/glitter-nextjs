import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import CreditAdjustButton from "@/app/components/credits/admin/credit-adjust-button";
import CreditDebtResolveButton from "@/app/components/credits/admin/credit-debt-resolve-button";
import CreditHoldsDataTable from "@/app/components/credits/admin/credit-holds-data-table";
import CreditLedgerDataTable from "@/app/components/credits/admin/credit-ledger-data-table";
import CreditPurchasesDataTable from "@/app/components/credits/admin/credit-purchases-data-table";
import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge } from "@/app/components/ui/badge";
import {
  CreditLedgerSearchParamsSchema,
  CreditPurchasesSearchParamsSchema,
  type RawSearchParams,
} from "@/app/lib/credits/admin-definitions";
import {
  fetchCreditAccountDetail,
  fetchCreditLedger,
  fetchCreditLedgerFestivals,
  fetchCreditPurchases,
} from "@/app/lib/credits/admin-queries";
import {
  calculateCreditBalances,
  unbackedHoldAmount,
} from "@/app/lib/credits/balances";
import { fetchFeatureHolds } from "@/app/lib/credits/queries";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";
import { cn } from "@/lib/utils";

export const CREDIT_ACCOUNT_TABS = ["movements", "purchases", "holds"] as const;
export type CreditAccountTab = (typeof CREDIT_ACCOUNT_TABS)[number];

const TAB_LABELS: Record<CreditAccountTab, string> = {
  movements: "Movimientos",
  purchases: "Compras",
  holds: "Retenciones",
};

function Figure({
  label,
  amount,
  signed,
  tone,
}: {
  label: string;
  amount: number;
  signed?: boolean;
  tone?: "red";
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd>
        <CreditAmount
          amount={amount}
          signed={signed}
          className={cn(
            "font-display text-lg font-semibold tabular-nums",
            tone === "red" && "text-red-600",
            amount === 0 && "text-muted-foreground",
          )}
        />
      </dd>
    </div>
  );
}

/**
 * One participant's credit account, sized to the viewport: who they are and
 * what to do on one line, every figure on another, and the rest — history,
 * purchases, holds — as tabs whose tables scroll inside themselves.
 */
export default async function CreditAccountDetail({
  userId,
  tab,
  searchParams,
}: {
  userId: number;
  tab: CreditAccountTab;
  searchParams: RawSearchParams;
}) {
  const ledgerParams = CreditLedgerSearchParamsSchema.parse(searchParams);
  const purchaseParams = CreditPurchasesSearchParamsSchema.parse(searchParams);
  const now = new Date();
  const [actor, detail, holds, festivals, ledger, purchases] =
    await Promise.all([
      getCurrentUserProfile(),
      fetchCreditAccountDetail(userId),
      fetchFeatureHolds(userId),
      fetchCreditLedgerFestivals(),
      // The person comes from the route; a `query` or `userId` in the URL
      // must not widen the history to somebody else's.
      fetchCreditLedger(
        tab === "movements"
          ? { ...ledgerParams, kinds: ledgerParams.kind, query: "", userId }
          : { userId, limit: 1 },
      ),
      fetchCreditPurchases(
        tab === "purchases"
          ? { ...purchaseParams, status: "all", userId }
          : { status: "all", userId, limit: 1 },
        now,
      ),
    ]);
  if (!detail || !ledger || !purchases) notFound();

  const { subject, account } = detail;
  const name = getUserName(subject) || subject.email;
  const canAdjust = canMutateAdminReservations(actor);
  const balances =
    account?.balances ??
    calculateCreditBalances({
      ledgerBalance: 0,
      activeHolds: 0,
      underReviewIssuance: 0,
    });
  const debtAmount = Math.max(0, -balances.ledgerBalance);
  const activeHolds = holds.filter((hold) => hold.status === "active").length;
  const counts: Record<CreditAccountTab, number> = {
    movements: ledger.total,
    purchases: purchases.counts.all,
    holds: holds.length,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/dashboard/credits/accounts"
            className="mt-0.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Volver a los saldos"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{name}</h2>
              {debtAmount > 0 && <Badge variant="red">Debe</Badge>}
              {account?.hasDrift && <Badge variant="amber">Descuadre</Badge>}
              {subject.role !== "user" && (
                <Badge variant="outline">No es participante</Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {subject.email} · #{subject.id} ·{" "}
              <Link
                href={`/dashboard/users/${subject.id}`}
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                Ver perfil
                <ExternalLinkIcon className="h-3 w-3" />
              </Link>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {debtAmount > 0 && (
            <CreditDebtResolveButton
              userId={subject.id}
              participantName={name}
              debtAmount={debtAmount}
              canResolve={canAdjust}
            />
          )}
          <CreditAdjustButton
            userId={subject.id}
            participantName={name}
            canAdjust={canAdjust}
          />
        </div>
      </div>

      <dl className="grid shrink-0 grid-cols-4 gap-x-4 gap-y-2 rounded-md border bg-background px-4 py-3 lg:grid-cols-8">
        <Figure
          label="Saldo"
          amount={balances.ledgerBalance}
          tone={balances.ledgerBalance < 0 ? "red" : undefined}
        />
        <Figure
          label="Disponible"
          amount={balances.spendableBalance}
          tone={balances.spendableBalance < 0 ? "red" : undefined}
        />
        <Figure label="Retenido" amount={balances.activeHolds} />
        <Figure label="En revisión" amount={balances.underReviewIssuance} />
        <Figure label="Comprado" amount={account?.purchased ?? 0} />
        <Figure label="Usado" amount={account?.spent ?? 0} />
        <Figure label="Revertido" amount={account?.reversed ?? 0} />
        <Figure label="Ajustes" amount={account?.adminNet ?? 0} signed />
      </dl>

      {(account?.hasDrift || debtAmount > 0) && (
        <p className="shrink-0 text-xs text-muted-foreground">
          {debtAmount > 0 &&
            "Con saldo negativo no puede usar créditos ni iniciar una función pagada hasta regularizarlo. "}
          {account?.hasDrift && (
            <>
              El saldo en caché (
              <CreditAmount amount={account.cachedBalance ?? 0} />) no coincide
              con el libro; el libro manda.
            </>
          )}
        </p>
      )}

      <nav
        aria-label="Secciones de la cuenta"
        className="flex shrink-0 gap-1 overflow-x-auto border-b [&::-webkit-scrollbar]:hidden"
      >
        {/* Each tab starts clean: its filters and page belong to its table. */}
        {(Object.keys(TAB_LABELS) as CreditAccountTab[]).map((value) => (
          <Link
            key={value}
            href={value === "movements" ? "?" : `?tab=${value}`}
            scroll={false}
            aria-current={value === tab ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              value === tab
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[value]}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
              {counts[value]}
            </span>
            {value === "holds" && activeHolds > 0 && (
              <Badge size="sm" variant="amber">
                {activeHolds === 1 ? "1 activa" : `${activeHolds} activas`}
              </Badge>
            )}
          </Link>
        ))}
      </nav>

      {tab === "movements" && (
        <CreditLedgerDataTable
          rows={ledger.rows}
          rowCount={ledger.total}
          totals={{
            creditsIn: ledger.creditsIn,
            creditsOut: ledger.creditsOut,
          }}
          festivals={festivals}
          canAdjust={canAdjust}
          showUser={false}
        />
      )}
      {tab === "purchases" && (
        <CreditPurchasesDataTable
          rows={purchases.rows}
          rowCount={purchases.total}
          totalAmount={purchases.totalAmount}
          status="all"
          festivals={festivals}
          canReview={canAdjust}
          now={now}
          showUser={false}
        />
      )}
      {tab === "holds" && (
        <CreditHoldsDataTable
          userId={subject.id}
          holds={holds}
          unbackedAmount={unbackedHoldAmount(balances)}
          canRelease={canAdjust}
        />
      )}
    </div>
  );
}
