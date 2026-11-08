import { ArrowRightIcon, ClockIcon, InfoIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import CreditLeadDaysDialog from "@/app/components/festivals/finance/credit-lead-days-dialog";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import type { FestivalFinance } from "@/app/lib/festivals/finance/queries";
import type {
  CreditBuckets,
  PendingRow,
} from "@/app/lib/festivals/finance/summary";
import { formatDate, formatMoney } from "@/app/lib/formatters";
import { featureActionLabel } from "@/app/lib/payments/feature-credits";
import { cn } from "@/app/lib/utils";

function share(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function percentLabel(part: number, whole: number) {
  return `${share(part, whole).toLocaleString("es-BO", { maximumFractionDigits: 1 })}%`;
}

/** "1 de octubre": the dates on this page are days, in Bolivian time. */
export function financeDay(date: Date) {
  return formatDate(date).toFormat("d 'de' LLLL");
}

const STRIPES = (ink: string, ground: string): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(135deg, ${ink} 0 3px, ${ground} 3px 6px)`,
});

/** One fill per payment kind. Words carry the meaning; fills only group. */
const TENDER_FILLS: Record<"direct" | keyof CreditBuckets, { className?: string; style?: CSSProperties }> = {
  direct: { className: "bg-primary" },
  festival: { className: "bg-primary-300" },
  earlier: { className: "bg-secondary-400" },
  gifted: { style: STRIPES("hsl(var(--secondary-400))", "hsl(var(--secondary-100))") },
  inReview: { style: STRIPES("var(--color-amber-500)", "var(--color-amber-100)") },
  unpaid: { className: "bg-muted-foreground" },
};

const PENDING_LABELS: Record<PendingRow["key"], { label: string; variant: BadgeVariant }> = {
  overdue: { label: "Vencidas", variant: "red" },
  upcoming: { label: "Por vencer", variant: "outline" },
  inReview: { label: "Comprobante en revisión", variant: "amber" },
};

function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="p-4 pb-3 md:p-6 md:pb-4">
        <CardTitle className="text-lg">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="p-4 pt-0 md:p-6 md:pt-0">{children}</CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  sub,
  lead = false,
}: {
  label: string;
  value: number;
  sub: string;
  lead?: boolean;
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-1.5 p-3.5 md:p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-display text-2xl font-bold tabular-nums md:text-3xl",
          lead && "text-primary",
        )}
      >
        {formatMoney(value)}
      </span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </Card>
  );
}

function StepRow({
  label,
  sub,
  amount,
  base,
  barClassName,
  minus = false,
  total = false,
}: {
  label: string;
  sub: string;
  amount: number;
  base: number;
  barClassName: string;
  minus?: boolean;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 border-b py-3 last:border-b-0",
        total && "border-b-2 border-b-foreground",
      )}
    >
      <div className={cn("flex min-w-0 flex-col text-sm", total && "font-semibold")}>
        {label}
        <span className="text-xs font-normal text-muted-foreground">{sub}</span>
      </div>
      <div
        className={cn(
          "text-right text-sm tabular-nums",
          minus && "text-muted-foreground",
          total && "font-semibold",
        )}
      >
        {minus && amount > 0 ? `−${formatMoney(amount)}` : formatMoney(amount)}
      </div>
      <div className="col-span-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full", barClassName)}
          style={{ width: `${Math.min(100, share(amount, base))}%` }}
        />
      </div>
    </div>
  );
}

function StepDown({ finance }: { finance: FestivalFinance }) {
  const s = finance.summary;
  const codes = s.discountRows.filter((row) => row.code != null).length;
  const manual = s.discountRows.find((row) => row.code == null)?.uses ?? 0;
  return (
    <SectionCard
      title="Del precio base a lo cobrado"
      description="Solo reservas de espacios. Los extras van aparte, abajo."
    >
      <div className="flex flex-col">
        <StepRow
          label="Precio base"
          sub={`${s.reservations} ${s.reservations === 1 ? "reserva vigente" : "reservas vigentes"}, a su precio sin descuentos`}
          amount={s.gross}
          base={s.gross}
          barClassName="bg-primary"
        />
        <StepRow
          label="Descuentos con código"
          sub={
            s.discounts > 0
              ? [
                  codes > 0 ? `${codes} ${codes === 1 ? "código" : "códigos"}` : null,
                  manual > 0 ? `${manual} ${manual === 1 ? "ajuste manual" : "ajustes manuales"}` : null,
                ]
                  .filter(Boolean)
                  .join(" y ")
              : "ninguno"
          }
          amount={s.discounts}
          base={s.gross}
          barClassName="bg-secondary-400"
          minus
        />
        <StepRow
          label="Condonaciones"
          sub={
            s.writeOffReservations > 0
              ? `${s.writeOffReservations} ${s.writeOffReservations === 1 ? "reserva cerrada" : "reservas cerradas"} por menos de lo que costaban`
              : "ninguna"
          }
          amount={s.writeOffs}
          base={s.gross}
          barClassName="bg-secondary-400"
          minus
        />
        <StepRow
          label="Total con descuentos"
          sub="lo que deben pagar los participantes"
          amount={s.net}
          base={s.gross}
          barClassName="bg-primary"
          total
        />
        <StepRow
          label="Cobrado de reservas"
          sub="pagos aprobados y créditos aplicados"
          amount={s.invoiceCollected}
          base={s.gross}
          barClassName="bg-primary-600"
        />
        <StepRow
          label="Por cobrar"
          sub="falta pagar, ya con descuentos"
          amount={s.outstanding}
          base={s.gross}
          barClassName="bg-amber-500"
        />
      </div>
      {s.inactiveCollected > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Además, {formatMoney(s.inactiveCollected)} se cobraron en reservas
          canceladas o liberadas que conservaron su pago. Suman a lo cobrado
          arriba, no a este desglose.
        </p>
      ) : null}
    </SectionCard>
  );
}

function TenderLegend({
  fill,
  name,
  sub,
  amount,
  total,
}: {
  fill: { className?: string; style?: CSSProperties };
  name: string;
  sub: string;
  amount: number;
  total: number;
}) {
  return (
    <div className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-start gap-x-2.5">
      <i
        className={cn("mt-1 h-3 w-3 rounded", fill.className)}
        style={fill.style}
        aria-hidden
      />
      <span className="text-sm font-medium">{name}</span>
      <span className="text-right text-sm tabular-nums">{formatMoney(amount)}</span>
      <span className="col-start-2 col-end-4 text-xs text-muted-foreground">
        {sub} · {percentLabel(amount, total)}
      </span>
    </div>
  );
}

function HowItWasPaid({ finance }: { finance: FestivalFinance }) {
  const s = finance.summary;
  const total = s.collected;
  const windowDay = financeDay(finance.windowStart);
  const opensDay = financeDay(finance.festival.reservationsStartDate);

  const segments: {
    key: keyof typeof TENDER_FILLS;
    name: string;
    sub: string;
    amount: number;
  }[] = [
    { key: "direct", name: "Pago directo", sub: "comprobantes aprobados", amount: s.directPayment },
    {
      key: "festival",
      name: "Créditos de esta edición",
      sub: `comprados desde el ${windowDay} o para este festival`,
      amount: s.credits.festival,
    },
    { key: "earlier", name: "Créditos anteriores", sub: "saldo que ya tenían antes", amount: s.credits.earlier },
    {
      key: "gifted",
      name: "Créditos regalados",
      sub: "obsequios y compensaciones: no entró dinero",
      amount: s.credits.gifted,
    },
    {
      key: "inReview",
      name: "Créditos con compra en revisión",
      sub: "se usaron antes de aprobar el comprobante de compra",
      amount: s.credits.inReview,
    },
    {
      key: "unpaid",
      name: "Créditos sin pagar",
      sub: "la compra se rechazó y el participante quedó debiendo",
      amount: s.credits.unpaid,
    },
  ];
  // The last two only show up when there is something in them.
  const visible = segments.filter(
    (segment) =>
      segment.amount > 0 || !["inReview", "unpaid"].includes(segment.key),
  );

  return (
    <SectionCard
      title="Cómo se pagó"
      description={`Todo lo cobrado, reservas y extras: ${formatMoney(total)}`}
    >
      <div
        className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={visible
          .filter((segment) => segment.amount > 0)
          .map((segment) => `${segment.name} ${percentLabel(segment.amount, total)}`)
          .join(", ")}
      >
        {visible
          .filter((segment) => segment.amount > 0)
          .map((segment) => (
            <span
              key={segment.key}
              className={cn("h-full", TENDER_FILLS[segment.key].className)}
              style={{
                ...TENDER_FILLS[segment.key].style,
                width: `${share(segment.amount, total)}%`,
              }}
            />
          ))}
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {visible.map((segment) => (
          <TenderLegend
            key={segment.key}
            fill={TENDER_FILLS[segment.key]}
            name={segment.name}
            sub={segment.sub}
            amount={segment.amount}
            total={total}
          />
        ))}
        <div className="grid grid-cols-[12px_minmax(0,1fr)_auto] gap-x-2.5 border-t pt-3 sm:col-span-2">
          <span className="col-start-2 text-sm font-medium">Total en créditos</span>
          <span className="text-right text-sm tabular-nums">{formatMoney(s.creditsTotal)}</span>
          <span className="col-start-2 col-end-4 text-xs text-muted-foreground">
            {formatMoney(s.invoiceCredits)} en reservas y{" "}
            {formatMoney(s.featureCredits)} en extras
          </span>
        </div>
      </div>

      {s.credits.inReview > 0 ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
          <ClockIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {formatMoney(s.credits.inReview)} en créditos salen de{" "}
            {s.inReviewPurchases === 1
              ? "una compra que todavía no se revisó"
              : `${s.inReviewPurchases} compras que todavía no se revisaron`}
            . Si se aprueba, pasa a créditos de esta edición; si se rechaza,
            queda como deuda del participante.{" "}
            <Link
              href="/dashboard/credits/reviews"
              className="font-semibold underline underline-offset-2"
            >
              Revisar compras
            </Link>
          </span>
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-2.5 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
        <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Los créditos se usan en orden de antigüedad: primero el saldo más
          viejo. Una compra cuenta como de esta edición si se hizo para este
          festival o desde{" "}
          <strong className="font-semibold text-foreground">
            {finance.leadDays === 1 ? "1 día antes" : `${finance.leadDays} días antes`}
          </strong>{" "}
          de abrir las reservas (desde el {windowDay}; abren el {opensDay}).{" "}
          <CreditLeadDaysDialog
            festivalId={finance.festival.id}
            leadDays={finance.leadDays}
            reservationsStartDate={finance.festival.reservationsStartDate.toISOString()}
            movable={s.movable}
            fixedFestivalCredits={s.fixedFestivalCredits}
            current={{ festival: s.credits.festival, earlier: s.credits.earlier }}
          />
        </span>
      </div>
    </SectionCard>
  );
}

function Extras({ finance }: { finance: FestivalFinance }) {
  const s = finance.summary;
  if (s.extras.length === 0) return null;
  return (
    <SectionCard
      title="Extras de reserva"
      description="Se pagan con créditos y no pasan por el cobro de la reserva."
    >
      <Table wrapperClassName="hidden md:block">
        <TableHeader>
          <TableRow>
            <TableHead>Extra</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">Créditos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {s.extras.map((row) => (
            <TableRow key={row.type}>
              <TableCell>{featureActionLabel(row.type)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.count}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(row.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell />
            <TableCell className="text-right tabular-nums">{formatMoney(s.featureCredits)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <ul className="divide-y md:hidden">
        {s.extras.map((row) => (
          <li key={row.type} className="flex items-center gap-3 py-3 text-sm">
            <span className="flex min-w-0 flex-1 flex-col">
              {featureActionLabel(row.type)}
              <span className="text-xs text-muted-foreground">
                {row.count} {row.count === 1 ? "compra" : "compras"}
              </span>
            </span>
            <span className="tabular-nums">{formatMoney(row.amount)}</span>
          </li>
        ))}
        <li className="flex justify-between pt-3 text-sm font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(s.featureCredits)}</span>
        </li>
      </ul>
    </SectionCard>
  );
}

function Discounts({ finance }: { finance: FestivalFinance }) {
  const s = finance.summary;
  const total = s.discounts + s.writeOffs;
  const rows = [
    ...s.discountRows.map((row) => ({
      key: row.code ?? "manual",
      name: row.code ?? "Sin código",
      mono: row.code != null,
      kind: row.label,
      uses: row.uses,
      amount: row.amount,
    })),
    ...(s.writeOffReservations > 0
      ? [
          {
            key: "write-offs",
            name: "Condonaciones",
            mono: false,
            kind: "cierre por menos",
            uses: s.writeOffReservations,
            amount: s.writeOffs,
          },
        ]
      : []),
  ];
  return (
    <SectionCard
      title="Descuentos"
      description="Lo que se dejó de cobrar sobre el precio base."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No se dieron descuentos ni condonaciones en esta edición.
        </p>
      ) : (
        <>
          <Table wrapperClassName="hidden md:block">
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Usos</TableHead>
                <TableHead className="text-right">Descuento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className={cn(row.mono && "font-mono text-[13px]")}>{row.name}</TableCell>
                  <TableCell>{row.kind}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.uses}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(row.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <ul className="divide-y md:hidden">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center gap-3 py-3 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn(row.mono && "font-mono text-[13px]")}>{row.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.kind} · {row.uses} {row.uses === 1 ? "uso" : "usos"}
                  </span>
                </span>
                <span className="tabular-nums">{formatMoney(row.amount)}</span>
              </li>
            ))}
            <li className="flex justify-between pt-3 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(total)}</span>
            </li>
          </ul>
        </>
      )}
    </SectionCard>
  );
}

function Pending({ finance, cobrosHref }: { finance: FestivalFinance; cobrosHref: string }) {
  const s = finance.summary;
  return (
    <SectionCard title="Por cobrar" description="Falta pagar, ya con descuentos.">
      {s.pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todas las reservas están cubiertas.</p>
      ) : (
        <ul className="divide-y">
          {s.pending.map((row) => (
            <li key={row.key} className="flex items-center gap-3 py-3 text-sm">
              <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <Badge variant={PENDING_LABELS[row.key].variant}>{PENDING_LABELS[row.key].label}</Badge>
                <span className="text-xs text-muted-foreground">
                  {row.reservations} {row.reservations === 1 ? "reserva" : "reservas"}
                </span>
              </span>
              <span className="tabular-nums">{formatMoney(row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex justify-between border-t pt-3 text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatMoney(s.outstanding)}</span>
      </div>
      <Button asChild variant="outline" className="mt-4 w-full">
        <Link href={cobrosHref}>
          Ver en cobros
          <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden />
        </Link>
      </Button>
    </SectionCard>
  );
}

function FreeStands({ finance }: { finance: FestivalFinance }) {
  const { count, value } = finance.summary.free;
  if (count === 0) return null;
  return (
    <SectionCard
      title="Espacios sin cobro"
      description="Cedidos a auspiciantes, aliados e invitados."
    >
      <div className="flex items-center gap-3 text-sm">
        <span className="flex min-w-0 flex-1 flex-col">
          {count} {count === 1 ? "espacio cedido" : "espacios cedidos"}
          <span className="text-xs text-muted-foreground">
            valor a precio base, no suma al total
          </span>
        </span>
        <span className="tabular-nums">{formatMoney(value)}</span>
      </div>
    </SectionCard>
  );
}

export function FinanceHeader({
  festivalId,
  disabled = false,
}: {
  festivalId: number;
  disabled?: boolean;
}) {
  const cobrosHref = `/dashboard/festivals/${festivalId}/reservations?lens=cobros`;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold md:text-3xl" data-installed-title="">
          Finanzas
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Lo que dejaron las reservas de espacios de esta edición: cuánto había
          que cobrar, cuánto se cobró y cómo se pagó.
        </p>
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        {disabled ? (
          <Button variant="outline" className="flex-1 sm:flex-none" disabled>
            Exportar CSV
          </Button>
        ) : (
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            {/* A download, not a page: a plain link skips client routing. */}
            <a href={`/dashboard/festivals/${festivalId}/finance/export`} download>
              Exportar CSV
            </a>
          </Button>
        )}
        <Button asChild className="flex-1 sm:flex-none">
          <Link href={cobrosHref}>
            Ver cobros
            <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function FinanceEmptyState({ finance }: { finance: FestivalFinance }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
          <WalletIcon className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="text-xl font-bold">Todavía no hay cobros</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Cuando los participantes reserven espacios, acá vas a ver cuánto había
          que cobrar, cuánto se cobró y cómo se pagó. Las reservas abren el{" "}
          {financeDay(finance.festival.reservationsStartDate)}.
        </p>
        <Button asChild variant="outline">
          <Link href={`/dashboard/festivals/${finance.festival.id}/reservations`}>
            Ver reservas
            <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/** The festival finance page, from its loaded figures. */
export default function FestivalFinanceView({ finance }: { finance: FestivalFinance }) {
  const s = finance.summary;
  const cobrosHref = `/dashboard/festivals/${finance.festival.id}/reservations?lens=cobros`;
  const inReview = s.pending.find((row) => row.key === "inReview")?.amount ?? 0;
  const given = s.discounts + s.writeOffs;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Kpi
          lead
          label="Cobrado"
          value={s.collected}
          sub="reservas y extras, en dinero y créditos"
        />
        <Kpi
          label="Dinero nuevo"
          value={s.newMoney}
          sub="pago directo más créditos comprados para esta edición"
        />
        <Kpi
          label="Por cobrar"
          value={s.outstanding}
          sub={
            inReview > 0
              ? `de los cuales ${formatMoney(inReview)} con comprobante en revisión`
              : "reservas vigentes sin cubrir"
          }
        />
        <Kpi
          label="Descuentos y condonaciones"
          value={given}
          sub={s.gross > 0 ? `${percentLabel(given, s.gross)} del precio base` : "sin reservas todavía"}
        />
      </div>

      <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6 lg:col-span-2">
          <StepDown finance={finance} />
          <HowItWasPaid finance={finance} />
          <Extras finance={finance} />
          <Discounts finance={finance} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <Pending finance={finance} cobrosHref={cobrosHref} />
          <FreeStands finance={finance} />
        </div>
      </div>
    </div>
  );
}
