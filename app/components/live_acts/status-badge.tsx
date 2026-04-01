import { Badge } from "@/app/components/ui/badge";
import { LiveActStatus } from "@/app/lib/live_acts/definitions";

const statusColors: Record<LiveActStatus, string> = {
  pending: "bg-yellow-500 hover:bg-yellow-600",
  backlog: "bg-blue-500 hover:bg-blue-600",
  approved: "bg-green-500 hover:bg-green-600",
  rejected: "bg-red-600 hover:bg-red-700",
};

const statusLabels: Record<LiveActStatus, string> = {
  pending: "Pendiente",
  backlog: "En lista de espera",
  approved: "Aprobado",
  rejected: "Rechazado",
};

export function LiveActStatusBadge({ status }: { status: LiveActStatus }) {
  return (
    <Badge className={statusColors[status]}>{statusLabels[status]}</Badge>
  );
}
