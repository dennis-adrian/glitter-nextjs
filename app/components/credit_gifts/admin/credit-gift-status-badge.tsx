import { Badge } from "@/app/components/ui/badge";

/** A gift's state: still crediting, or every recipient processed. */
export default function CreditGiftStatusBadge({
  status,
  failed,
}: {
  status: "processing" | "completed";
  failed: number;
}) {
  if (status === "processing") return <Badge variant="amber">Procesando</Badge>;
  if (failed > 0) return <Badge variant="red">Con errores</Badge>;
  return <Badge variant="green">Enviado</Badge>;
}
