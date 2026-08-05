import { DateTime } from "luxon";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import PromoCodeForm from "@/app/components/dashboard/programs/promo-code-form";
import { Badge } from "@/app/components/ui/badge";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { formatDate } from "@/app/lib/formatters";
import {
  fetchProgramPromoCodeForAdmin,
  fetchProgramsForPromoCodeForm,
} from "@/app/lib/programs/promo-code-admin-queries";
import { SESSION_PURCHASE_STATUS_LABELS } from "@/app/lib/programs/definitions";
import { formatMoney } from "@/app/lib/programs/pricing";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type Props = { params: Promise<{ promoCodeId: string }> };

export default async function ProgramPromoCodeDetailPage({ params }: Props) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const { promoCodeId: rawId } = await params;
  const promoCodeId = Number(rawId);
  if (!Number.isInteger(promoCodeId) || promoCodeId <= 0) notFound();

  const [detail, programs] = await Promise.all([
    fetchProgramPromoCodeForAdmin(promoCodeId),
    fetchProgramsForPromoCodeForm(),
  ]);
  if (!detail) notFound();

  const { promoCode, redemptions, events } = detail;
  const now = new Date();
  const isExpired = promoCode.expiresAt !== null && promoCode.expiresAt < now;
  const isScheduled = promoCode.startsAt !== null && promoCode.startsAt > now;
  const isEffectivelyActive = promoCode.isActive && !isExpired && !isScheduled;
  const effectiveStatusLabel = !promoCode.isActive
    ? "Inactivo"
    : isExpired
      ? "Vencido"
      : isScheduled
        ? "Programado"
        : "Activo";
  const usage = redemptions.reduce(
    (totals, redemption) => {
      const purchase = redemption.purchase;
      if (purchase.approvedAt) totals.confirmed += 1;
      else if (
        purchase.status === "under_verification" ||
        purchase.status === "changes_requested" ||
        (purchase.status === "pending_upload" &&
          purchase.holdExpiresAt !== null &&
          purchase.holdExpiresAt > now)
      ) {
        totals.inProgress += 1;
      } else totals.released += 1;
      return totals;
    },
    { confirmed: 0, inProgress: 0, released: 0 },
  );

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      <div>
        <Link
          href="/dashboard/programs/promo-codes"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ← Códigos promocionales
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{promoCode.code}</h1>
          <Badge
            variant={
              isEffectivelyActive
                ? "green"
                : promoCode.isActive && isExpired
                  ? "red"
                  : "secondary"
            }
          >
            {effectiveStatusLabel}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {promoCode.program.name} · {promoCode.partnerName}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Configuración</CardTitle>
          </CardHeader>
          <CardContent>
            <PromoCodeForm
              programs={programs}
              promoCode={promoCode}
              hasRedemptions={redemptions.length > 0}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Usos e intentos</CardTitle>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="green">{usage.confirmed} confirmados</Badge>
                <Badge variant="outline">{usage.inProgress} en proceso</Badge>
                <Badge variant="secondary">{usage.released} liberados</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {redemptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  El código todavía no fue usado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Persona</TableHead>
                      <TableHead>Sesión</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions.map((redemption) => {
                      const purchase = redemption.purchase;
                      const name = purchase.userId
                        ? (purchase.buyer?.displayName ?? purchase.buyer?.email)
                        : purchase.guestName;
                      return (
                        <TableRow key={redemption.id}>
                          <TableCell>
                            <p className="font-medium">
                              {name ?? "Registro anonimizado"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {purchase.buyer?.email ??
                                purchase.guestEmail ??
                                "—"}
                            </p>
                          </TableCell>
                          <TableCell>
                            {purchase.lines
                              .map((line) => line.session.title)
                              .join(", ")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                purchase.approvedAt ? "green" : "outline"
                              }
                            >
                              {SESSION_PURCHASE_STATUS_LABELS[purchase.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p>{formatMoney(redemption.totalAmountSnapshot)}</p>
                            <p className="text-xs text-muted-foreground">
                              Base {formatMoney(redemption.baseAmountSnapshot)}{" "}
                              · −
                              {formatMoney(redemption.discountAmountSnapshot)}
                            </p>
                            {redemption.higherPriceAcceptedAt ? (
                              <p className="text-xs font-medium text-amber-700">
                                Precio mayor aceptado
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDate(redemption.createdAt).toLocaleString(
                              DateTime.DATETIME_MED,
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex justify-between gap-4 border-b pb-3 last:border-0"
                  >
                    <span>
                      {PROMO_EVENT_LABELS[event.eventType]} ·{" "}
                      {event.actor?.displayName ??
                        event.actor?.email ??
                        "Sistema"}
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(event.createdAt).toLocaleString(
                        DateTime.DATETIME_MED,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const PROMO_EVENT_LABELS = {
  created: "Creado",
  updated: "Actualizado",
  activated: "Activado",
  deactivated: "Desactivado",
} as const;
