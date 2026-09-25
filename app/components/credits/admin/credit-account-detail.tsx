import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import CreditAccountTopUps from "@/app/components/credits/admin/credit-account-top-ups";
import CreditActiveHolds from "@/app/components/credits/admin/credit-active-holds";
import CreditAdjustButton from "@/app/components/credits/admin/credit-adjust-button";
import CreditDebtResolveButton from "@/app/components/credits/admin/credit-debt-resolve-button";
import CreditHoldHistory from "@/app/components/credits/admin/credit-hold-history";
import CreditLedgerFilters from "@/app/components/credits/admin/credit-ledger-filters";
import CreditLedgerTable from "@/app/components/credits/admin/credit-ledger-table";
import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";
import TableSkeleton from "@/app/components/users/skeletons/table";
import type { CreditLedgerSearchParams } from "@/app/lib/credits/admin-definitions";
import {
  fetchCreditAccountDetail,
  fetchCreditLedgerFestivals,
  fetchCreditTopUpsForAccount,
} from "@/app/lib/credits/admin-queries";
import { calculateCreditBalances } from "@/app/lib/credits/balances";
import { fetchFeatureHolds } from "@/app/lib/credits/queries";
import { formatDateWithTime } from "@/app/lib/formatters";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";
import { cn } from "@/lib/utils";

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
    <div className="space-y-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd>
        <CreditAmount
          amount={amount}
          signed={signed}
          className={cn(
            "font-display text-xl font-semibold tabular-nums",
            tone === "red" && "text-red-600",
            amount === 0 && "text-muted-foreground",
          )}
        />
      </dd>
    </div>
  );
}

export default async function CreditAccountDetail({
  userId,
  ledgerParams,
}: {
  userId: number;
  ledgerParams: CreditLedgerSearchParams;
}) {
  const [actor, detail, topUps, holds, festivals] = await Promise.all([
    getCurrentUserProfile(),
    fetchCreditAccountDetail(userId),
    fetchCreditTopUpsForAccount(userId),
    fetchFeatureHolds(userId),
    fetchCreditLedgerFestivals(),
  ]);
  if (!detail) notFound();

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

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/credits/accounts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Todas las cuentas
      </Link>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-xl font-semibold">{name}</h2>
          <p className="truncate text-sm text-muted-foreground">
            {subject.email} · #{subject.id}
          </p>
          <div className="flex flex-wrap gap-1">
            {debtAmount > 0 && <Badge variant="red">Debe</Badge>}
            {account?.hasDrift && <Badge variant="amber">Descuadre</Badge>}
            {subject.role !== "user" && (
              <Badge variant="secondary">No es participante</Badge>
            )}
          </div>
          <Link
            href={`/dashboard/users/${subject.id}`}
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
          >
            Ver perfil
            <ExternalLinkIcon className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <CreditAdjustButton
            userId={subject.id}
            participantName={name}
            canAdjust={canAdjust}
          />
          {debtAmount > 0 && (
            <CreditDebtResolveButton
              userId={subject.id}
              participantName={name}
              debtAmount={debtAmount}
              canResolve={canAdjust}
            />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
          </dl>
          <dl className="grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-4">
            <Figure label="Comprado" amount={account?.purchased ?? 0} />
            <Figure label="Usado" amount={account?.spent ?? 0} />
            <Figure
              label="Revertido por rechazo"
              amount={account?.reversed ?? 0}
            />
            <Figure label="Ajustes" amount={account?.adminNet ?? 0} signed />
          </dl>
          {account?.lastActivityAt && (
            <p className="text-xs text-muted-foreground">
              Último movimiento {formatDateWithTime(account.lastActivityAt)}
            </p>
          )}
          {account?.hasDrift && (
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              El saldo en caché (
              <CreditAmount amount={account.cachedBalance ?? 0} />) no coincide
              con el libro. El libro manda; revisá esta cuenta antes de tocarla.
            </p>
          )}
          {debtAmount > 0 && (
            <p className="rounded-md bg-red-50 p-3 text-xs text-red-900">
              Con saldo negativo no puede usar créditos ni iniciar una función
              pagada hasta regularizarlo.
            </p>
          )}
          <CreditActiveHolds
            userId={subject.id}
            holds={holds}
            balances={balances}
            canAdjust={canAdjust}
          />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Movimientos</h3>
        <CreditLedgerFilters festivals={festivals} showSearch={false} />
        <Suspense
          key={JSON.stringify(ledgerParams)}
          fallback={<TableSkeleton />}
        >
          <CreditLedgerTable params={ledgerParams} showUser={false} />
        </Suspense>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Compras</h3>
          <CreditAccountTopUps topUps={topUps} />
        </section>
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Créditos retenidos</h3>
          <CreditHoldHistory holds={holds} />
        </section>
      </div>
    </div>
  );
}
