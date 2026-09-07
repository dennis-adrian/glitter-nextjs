import { MapPin } from "lucide-react";

import { cn } from "@/app/lib/utils";

type MapPinchHintProps = {
  className?: string;
};

export default function MapPinchHint({ className }: MapPinchHintProps) {
  return (
    <div
      className={cn(
        "absolute bottom-2 left-1/2 -translate-x-1/2 z-10 md:hidden",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 rounded-full bg-gray-900/80 px-3 py-1.5 text-white backdrop-blur-sm">
        <MapPin className="h-3 w-3" />
        <span className="text-xs font-medium">Pellizca para ampliar</span>
      </div>
    </div>
  );
}
