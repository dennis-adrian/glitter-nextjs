import { Badge } from "@/app/components/ui/badge";
import { FestivalBase } from "@/app/lib/festivals/definitions";

export default function FestivalStatusBadge({
  status,
}: {
  status: FestivalBase["status"];
}) {
  if (status === "active") {
    return (
      <Badge className="bg-green-100 text-green-800 font-normal border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-800">
        Activo
      </Badge>
    );
  }

  if (status === "archived") {
    return (
      <Badge className="bg-gray-100 text-gray-800 font-normal border-gray-300 dark:bg-muted dark:text-foreground dark:border-border">
        Archivado
      </Badge>
    );
  }

  if (status === "draft") {
    return (
      <Badge className="bg-amber-100 text-amber-800 font-normal border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800">
        Borrador
      </Badge>
    );
  }

  if (status === "published") {
    return (
      <Badge className="bg-sky-100 text-sky-800 font-normal border-sky-300 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-800">
        Publicado
      </Badge>
    );
  }
}
