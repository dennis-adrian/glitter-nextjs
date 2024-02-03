import { RequestStatusEnum } from "@/app/api/user_requests/definitions";
import { Badge } from "@/app/components/ui/badge";

export function RequestStatusBadge({
  status,
}: {
  status: (typeof RequestStatusEnum)[keyof typeof RequestStatusEnum];
}) {
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
    <Badge className={`${statusColors[status]}`}>{statusLabels[status]}</Badge>
  );
}
