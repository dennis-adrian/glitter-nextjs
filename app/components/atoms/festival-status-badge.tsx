import { Badge } from "@/app/components/ui/badge";
import { FestivalBase } from "@/app/data/festivals/definitions";

export default function FestivalStatusBadge({
  status,
}: {
  status: FestivalBase["status"];
}) {
  if (status === "active") {
    return (
      <Badge className="bg-green-100 text-green-800 font-normal border-green-300">
        Activo
      </Badge>
    );
  }

  if (status === "archived") {
    return (
      <Badge className="bg-gray-100 text-gray-800 font-normal border-gray-300">
        Archivado
      </Badge>
    );
  }

  if (status === "draft") {
    return (
      <Badge className="bg-amber-100 text-amber-800 font-normal border-amber-300">
        Borrador
      </Badge>
    );
  }
}
