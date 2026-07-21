import {
  AlertCircleIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ClockIcon,
  MapPinIcon,
  XCircleIcon,
} from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";

import Heading from "@/app/components/atoms/heading";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  InvoiceWithPayments,
  InvoiceWithPaymentsAndOwner,
  ReservationWithStandAndInvoicesAndFestival,
} from "@/app/data/invoices/definitions";
import { formatDate } from "@/app/lib/formatters";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { cn } from "@/app/lib/utils";

const PAYMENT_DUE_DAYS = 5;

export type InvoiceWithReservation = InvoiceWithPaymentsAndOwner & {
  reservation: ReservationWithStandAndInvoicesAndFestival;
};

type Props = {
  invoice: InvoiceWithReservation;
  profileId: number;
  festivalId: number;
};

export default function InvoiceCard({ invoice, profileId, festivalId }: Props) {
  const statusConfig = getInvoiceStatusConfig(invoice.status);
  const createdAt = formatDate(invoice.createdAt);
  const dueDate = createdAt.plus({ days: PAYMENT_DUE_DAYS });
  const isPending = invoice.status === "pending";
  const isOverdue = isPending && DateTime.now() > dueDate;
  const isOwner = invoice.userId === profileId;
  const standLabel = formatStandLabel(invoice.reservation.stand);
  const sectorName = invoice.reservation.stand.festivalSector?.name;

  return (
    <Card>
      <CardContent className="p-4 md:p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <Heading level={4}>
              {invoice.amount === 0
                ? "Reserva sin costo"
                : `Bs${invoice.amount}`}
            </Heading>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPinIcon className="w-3.5 h-3.5 shrink-0" />
              {sectorName ? `${sectorName} · ` : ""}Espacio {standLabel}
            </p>
          </div>
          <Badge
            className={cn(
              "flex items-center gap-1 shrink-0",
              statusConfig.badgeStyle,
            )}
          >
            <statusConfig.icon className="w-3.5 h-3.5 shrink-0" />
            {statusConfig.label}
          </Badge>
        </div>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
            Creada el {createdAt.toLocaleString(DateTime.DATE_MED)}
          </span>
          {isPending && (
            <span
              className={cn(
                "flex items-center gap-1",
                isOverdue && "text-red-600 font-medium",
              )}
            >
              <ClockIcon className="w-3.5 h-3.5 shrink-0" />
              {isOverdue ? "Vencida el" : "Vence el"}{" "}
              {dueDate.toLocaleString(DateTime.DATE_MED)} a las{" "}
              {dueDate.toLocaleString(DateTime.TIME_SIMPLE)}
            </span>
          )}
        </div>

        {isPending &&
          (isOwner ? (
            <Button asChild variant="default" size="sm" className="w-full">
              <Link
                href={`/profiles/${profileId}/festivals/${festivalId}/reservations/${invoice.reservation.id}/payments`}
              >
                {invoice.amount === 0 ? "Confirmar reserva" : "Completar pago"}
                <ArrowRightIcon className="w-3.5 h-3.5 shrink-0 ml-1" />
              </Link>
            </Button>
          ) : (
            <Banner variant="info">
              Contactá al titular de la reserva
              {getOwnerDisplayName(invoice.user)
                ? `, ${getOwnerDisplayName(invoice.user)},`
                : ""}{" "}
              para completar este pago.
            </Banner>
          ))}
      </CardContent>
    </Card>
  );
}

function getOwnerDisplayName(
  user: InvoiceWithPaymentsAndOwner["user"] | null | undefined,
): string | null {
  if (!user) return null;
  if (user.displayName) return user.displayName;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return fullName || null;
}

function getInvoiceStatusConfig(status: InvoiceWithPayments["status"]) {
  switch (status) {
    case "paid":
      return {
        icon: CheckCircle2Icon,
        label: "Pagada",
        badgeStyle: "bg-green-600/10 text-green-800 border-green-600/20",
      };
    case "pending":
      return {
        icon: AlertCircleIcon,
        label: "Pendiente",
        badgeStyle: "bg-orange-500/10 text-orange-700 border-orange-500/20",
      };
    case "cancelled":
      return {
        icon: XCircleIcon,
        label: "Cancelada",
        badgeStyle: "bg-gray-500/10 text-gray-700 border-gray-500/20",
      };
  }
}
