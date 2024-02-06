import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/actions";
import { Badge } from "@/app/components/ui/badge";

export function ReservationStatus({
  reservation,
}: {
  reservation: ReservationWithParticipantsAndUsersAndStand;
}) {
  const { status } = reservation;

  const statusColors = {
    pending: "bg-yellow-500 hover:bg-yellow-600",
    accepted: "bg-green-500 hover:bg-green-600",
    rejected: "bg-red-600 hover:bg-red-700",
  };

  const statusLabels = {
    pending: "Pendiente",
    accepted: "Aceptada",
    rejected: "Rechazada",
  };

  return (
    <Badge className={`${statusColors[status]} bg-opacity-50`}>
      {statusLabels[status]}
    </Badge>
  );
}
