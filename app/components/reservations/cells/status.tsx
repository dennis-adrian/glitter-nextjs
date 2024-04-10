import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/actions";
import { ReservationWithStand } from "@/app/api/reservations/definitions";
import { Badge } from "@/app/components/ui/badge";

export function ReservationStatus({
  reservation,
}: {
  reservation:
    | ReservationWithParticipantsAndUsersAndStand
    | ReservationWithStand;
}) {
  const { status } = reservation;

  const statusColors = {
    pending: "bg-gray-500 hover:bg-gray-400",
    accepted: "bg-green-500 hover:bg-green-400",
    rejected: "bg-red-600 hover:bg-red-500",
  };

  const statusLabels = {
    pending: "Pendiente",
    accepted: "Confirmada",
    rejected: "Rechazada",
  };

  return (
    <Badge className={`${statusColors[status]}`}>{statusLabels[status]}</Badge>
  );
}
