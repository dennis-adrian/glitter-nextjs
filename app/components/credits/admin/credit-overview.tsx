import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ScaleIcon,
} from "lucide-react";
import Link from "next/link";

import CreditAmount from "@/app/components/credits/credit-amount";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  CREDIT_LEDGER_KIND_LABELS,
  CREDIT_LEDGER_KINDS,
} from "@/app/lib/credits/admin-definitions";
import {
  CREDIT_OVERVIEW_RECENT_DAYS,
  fetchCreditOverview,
} from "@/app/lib/credits/admin-queries";
import { getUserName } from "@/app/lib/users/utils";
import { cn } from "@/lib/utils";

function StatTile({
  label,
  amount,
  hint,
  tone,
}: {
  label: string;
  amount: number;
  hint: string;
  tone?: "red" | "amber";
}) {
  return (
    <Card
      className={cn(
        "h-full",
        tone === "red" && amount > 0 && "border-red-300",
        tone === "amber" && amount > 0 && "border-amber-300",
      )}
    >
      <CardContent className="flex flex-col gap-0.5 p-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <CreditAmount
          amount={amount}
          className={cn(
            "font-display text-2xl font-semibold tabular-nums leading-tight",
            tone === "red" && amount > 0 && "text-red-600",
            tone === "amber" && amount > 0 && "text-amber-600",
          )}
        />
        <span className="text-xs text-muted-foreground">{hint}</span>
      </CardContent>
    </Card>
  );
}

function AttentionLink({
  href,
  icon: Icon,
  children,
  tone,
}: {
  href: string;
  icon: typeof AlertTriangleIcon;
  children: React.ReactNode;
  tone: "amber" | "red";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md border p-3 text-sm transition-colors",
        tone === "red"
          ? "border-red-200 bg-red-50 text-red-900 hover:bg-red-100"
          : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRightIcon className="h-4 w-4 shrink-0" />
    </Link>
  );
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export default async function CreditOverview() {
  const overview = await fetchCreditOverview();
  if (!overview) return null;

  const kinds = CREDIT_LEDGER_KINDS.filter(
    (kind) => overview.lifetime[kind].count > 0,
  );
  const lifetimeNet = kinds.reduce(
    (total, kind) => total + overview.lifetime[kind].amount,
    0,
  );
  const recentNet = kinds.reduce(
    (total, kind) => total + overview.recent[kind].amount,
    0,
  );
  const needsAttention =
    overview.underReview.count > 0 ||
    overview.debtorCount > 0 ||
    overview.driftCount > 0;

  return (
    <div className="space-y-6">
      <section aria-label="Pendientes" className="space-y-2">
        {needsAttention ? (
          <>
            {overview.underReview.count > 0 && (
              <AttentionLink
                href="/dashboard/credits/reviews"
                icon={ClipboardCheckIcon}
                tone="amber"
              >
                {plural(
                  overview.underReview.count,
                  "compra espera",
                  "compras esperan",
                )}{" "}
                revisión, por{" "}
                <CreditAmount
                  amount={overview.underReview.amount}
                  className="font-semibold"
                />
                . Esos créditos ya se pueden usar.
              </AttentionLink>
            )}
            {overview.debtorCount > 0 && (
              <AttentionLink
                href="/dashboard/credits/debts"
                icon={AlertTriangleIcon}
                tone="red"
              >
                {plural(overview.debtorCount, "cuenta está", "cuentas están")}{" "}
                en negativo, por{" "}
                <CreditAmount
                  amount={overview.debtTotal}
                  className="font-semibold"
                />{" "}
                en total. No pueden usar créditos hasta regularizarlas.
              </AttentionLink>
            )}
            {overview.driftCount > 0 && (
              <AttentionLink
                href="/dashboard/credits/accounts?filter=drift"
                icon={ScaleIcon}
                tone="amber"
              >
                {plural(overview.driftCount, "cuenta tiene", "cuentas tienen")}{" "}
                el saldo en caché descuadrado con el libro.
              </AttentionLink>
            )}
          </>
        ) : (
          <p className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
            <CheckCircle2Icon className="h-5 w-5 shrink-0 text-green-600" />
            No hay compras por revisar, deudas ni descuadres.
          </p>
        )}
      </section>

      <section
        aria-label="Indicadores de créditos"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatTile
          label="En manos de participantes"
          amount={overview.outstanding}
          hint={plural(
            overview.holderCount,
            "cuenta con saldo",
            "cuentas con saldo",
          )}
        />
        <StatTile
          label="Retenidos"
          amount={overview.activeHolds.amount}
          hint={`${plural(overview.activeHolds.count, "función activada", "funciones activadas")}, sin cobrar todavía`}
        />
        <StatTile
          label="En revisión"
          amount={overview.underReview.amount}
          hint={`${plural(overview.underReview.count, "comprobante", "comprobantes")}${
            overview.awaitingVoucherCount > 0
              ? ` · ${plural(overview.awaitingVoucherCount, "compra espera", "compras esperan")} su comprobante`
              : ""
          }`}
          tone="amber"
        />
        <StatTile
          label="Adeudado"
          amount={overview.debtTotal}
          hint={plural(
            overview.debtorCount,
            "cuenta en negativo",
            "cuentas en negativo",
          )}
          tone="red"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Movimientos por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            {kinds.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todavía no se movió ningún crédito.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">
                      Últimos {CREDIT_OVERVIEW_RECENT_DAYS} días
                    </TableHead>
                    <TableHead className="text-right">Histórico</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kinds.map((kind) => (
                    <TableRow key={kind}>
                      <TableCell>
                        <Link
                          href={`/dashboard/credits/ledger?kind=${kind}`}
                          className="hover:underline"
                        >
                          {CREDIT_LEDGER_KIND_LABELS[kind]}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <CreditAmount
                          amount={overview.recent[kind].amount}
                          signed
                        />
                        <span className="block text-xs text-muted-foreground">
                          {overview.recent[kind].count} mov.
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <CreditAmount
                          amount={overview.lifetime[kind].amount}
                          signed
                        />
                        <span className="block text-xs text-muted-foreground">
                          {overview.lifetime[kind].count} mov.
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Saldo neto</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <CreditAmount amount={recentNet} signed />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <CreditAmount amount={lifetimeNet} signed />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              El saldo neto histórico es lo que tienen los participantes menos
              lo que deben. Las retenciones no son movimientos: apartan créditos
              sin sacarlos del saldo.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Mayores saldos</CardTitle>
            <Link
              href="/dashboard/credits/accounts"
              className="text-sm text-primary hover:underline"
            >
              Ver todos
            </Link>
          </CardHeader>
          <CardContent>
            {overview.topHolders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nadie tiene créditos disponibles.
              </p>
            ) : (
              <ul className="divide-y">
                {overview.topHolders.map((row) => (
                  <li key={row.user.id}>
                    <Link
                      href={`/dashboard/credits/accounts/${row.user.id}`}
                      className="flex items-center justify-between gap-3 py-2 hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {getUserName(row.user) || row.user.email}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.user.email}
                        </span>
                      </span>
                      <CreditAmount
                        amount={row.balances.ledgerBalance}
                        className="shrink-0 text-sm font-medium tabular-nums"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
