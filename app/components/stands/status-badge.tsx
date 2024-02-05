import { Badge } from "@/app/components/ui/badge";

const statusLabels = {
  reserved: "Reservado",
  confirmed: "Confirmado",
  available: "Disponible",
  disabled: "Deshabilitado",
};

const statusColors = {
  reserved: "bg-emerald-400 hover:bg-emerald-600 text-white",
  confirmed: "bg-red-500 hover:bg-fuchsia-600 text-white",
  available: "",
  disabled: "bg-zinc-300 text-zinc-500",
};

export function StandStatusBadge({
  status,
}: {
  status: "reserved" | "confirmed" | "available" | "disabled";
}) {
  return (
    <Badge variant="outline" className={`${statusColors[status]}`}>
      {statusLabels[status]}
    </Badge>
  );
}
