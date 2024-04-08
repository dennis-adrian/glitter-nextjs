import { Badge } from "@/app/components/ui/badge";
import { FestivalBase } from "@/app/data/festivals/definitions";

export default function FestivalStatusBadge({
  status,
}: {
  status: FestivalBase["status"];
}) {
  if (status === "active") {
    return <Badge className="bg-green-500">Activo</Badge>;
  }

  if (status === "archived") {
    return <Badge className="bg-gray-600">Archivado</Badge>;
  }

  if (status === "draft") {
    return <Badge className="bg-amber-700">Borrador</Badge>;
  }
}
