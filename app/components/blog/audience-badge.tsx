import { LockIcon } from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/lib/utils";
import type { PostAudience } from "@/app/lib/posts/definitions";

/**
 * Marks a restricted article wherever it appears. Public posts render nothing
 * — an unmarked article being readable by everyone is the expectation, so a
 * badge saying so would be noise on almost every card.
 */
export default function AudienceBadge({
  audience,
  className,
}: {
  audience: PostAudience;
  className?: string;
}) {
  if (audience === "public") return null;

  return (
    <Badge variant="secondary" className={cn("gap-1 font-normal", className)}>
      <LockIcon className="size-3" />
      Solo participantes
    </Badge>
  );
}
