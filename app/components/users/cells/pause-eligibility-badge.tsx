import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/lib/utils";

type PauseEligibilityBadgeProps = {
  reason: string;
  isEligible: boolean;
  className?: string;
};

const REASON_VARIANTS: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  Elegible: "default",
  "Activo reciente": "secondary",
  "Ya pausado": "outline",
  Vetado: "destructive",
  "Cuenta de administrador": "outline",
  "No es participante activo": "outline",
};

export default function PauseEligibilityBadge({
  reason,
  isEligible,
  className,
}: PauseEligibilityBadgeProps) {
  return (
    <Badge
      variant={REASON_VARIANTS[reason] ?? "outline"}
      className={cn(
        isEligible && "bg-amber-100 text-amber-800 border-amber-200",
        className,
      )}
    >
      {reason}
    </Badge>
  );
}
