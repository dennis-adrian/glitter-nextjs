import { ImageIcon } from "lucide-react";

import { cn } from "@/app/lib/utils";

type MediaPlaceholderProps = {
  label?: string;
  className?: string;
  iconClassName?: string;
};

export default function MediaPlaceholder({
  label,
  className,
  iconClassName,
}: MediaPlaceholderProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      <ImageIcon className={cn("size-5", iconClassName)} aria-hidden="true" />
      {label ? <span className="px-2 text-center text-xs">{label}</span> : null}
    </div>
  );
}
