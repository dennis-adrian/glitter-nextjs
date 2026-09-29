import { MicIcon, PencilRulerIcon } from "lucide-react";

import {
  SESSION_TYPE_LABELS,
  type SessionType,
} from "@/app/lib/programs/definitions";
import { cn } from "@/app/lib/utils";

type SessionTypePillProps = {
  type: SessionType;
  className?: string;
};

export default function SessionTypePill({
  type,
  className,
}: SessionTypePillProps) {
  const Icon = type === "workshop" ? PencilRulerIcon : MicIcon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-brand-ink/10 bg-brand-card px-2.5 py-1 text-xs font-semibold text-brand-ink",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 text-brand-primary" />
      {SESSION_TYPE_LABELS[type]}
    </span>
  );
}
