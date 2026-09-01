import { ReservationBase } from "@/app/api/reservations/definitions";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/lib/utils";

const statusColors = {
  pending:
    "bg-gray-500/20 border border-gray-300 text-gray-800 hover:bg-gray-500/30 hover:border-gray-300",
  accepted:
    "bg-green-500/20 border border-green-300 text-green-800 hover:bg-green-500/30 hover:border-green-300",
  verification_payment:
    "bg-blue-500/20 border border-blue-300 text-blue-800 hover:bg-blue-500/30 hover:border-blue-300",
  rejected:
    "bg-red-500/20 border border-red-300 text-red-800 hover:bg-red-500/30 hover:border-red-300",
  cancelled:
    "bg-orange-500/20 border border-orange-300 text-orange-800 hover:bg-orange-500/30 hover:border-orange-300",
  released:
    "bg-slate-500/20 border border-slate-300 text-slate-800 hover:bg-slate-500/30 hover:border-slate-300",
} satisfies Record<ReservationBase["status"], string>;

const statusLabels = {
  pending: "Pendiente",
  accepted: "Confirmada",
  verification_payment: "Verificación de Pago",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  released: "Liberada",
} satisfies Record<ReservationBase["status"], string>;

export default function ReservationStatusBadge({
  status,
  className,
}: {
  status: ReservationBase["status"];
  className?: string;
}) {
  return (
    <Badge className={cn(statusColors[status], "font-normal", className)}>
      {statusLabels[status]}
    </Badge>
  );
}
