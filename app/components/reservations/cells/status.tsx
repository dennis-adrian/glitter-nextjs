import { ReservationBase } from "@/app/api/reservations/definitions";
import { Badge } from "@/app/components/ui/badge";

export function ReservationStatus({
  reservation,
}: {
  reservation: ReservationBase;
}) {
  const { status } = reservation;

  const statusColors = {
    pending: "bg-gray-500 hover:bg-gray-400",
    accepted: "bg-green-500 hover:bg-green-400",
    verification_payment: "bg-blue-500 hover:bg-blue-400",
    rejected: "bg-red-600 hover:bg-red-500",
    cancelled: "bg-orange-600 hover:bg-orange-500",
    released: "bg-slate-600 hover:bg-slate-500",
  } satisfies Record<ReservationBase["status"], string>;

  const statusLabels = {
    pending: "Pendiente",
    verification_payment: "Verificación de Pago",
    accepted: "Confirmada",
    rejected: "Rechazada",
    cancelled: "Cancelada",
    released: "Liberada",
  } satisfies Record<ReservationBase["status"], string>;

  return (
    <Badge className={`${statusColors[status]}`}>{statusLabels[status]}</Badge>
  );
}
