import { Badge } from "@/app/components/ui/badge";

const statusLabels = {
  reserved: "Reservado",
  confirmed: "Confirmado",
  available: "Disponible",
};

const statusColors = {
  reserved: "bg-emerald-400 hover:bg-emerald-600 text-white",
  confirmed: "bg-red-500 hover:bg-fuchsia-600 text-white",
  available: "",
};

export function StandStatusBadge({
  status,
}: {
  status: "reserved" | "confirmed" | "available";
}) {
  return (
    <Badge variant="outline" className={`${statusColors[status]}`}>
      {statusLabels[status]}
    </Badge>
  );
}
