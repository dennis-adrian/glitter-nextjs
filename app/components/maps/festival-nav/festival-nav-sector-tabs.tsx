import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { cn } from "@/app/lib/utils";

type FestivalNavSectorTabsProps = {
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  activeIndex: number; // -1 = all sectors
  onChange: (index: number) => void;
  flush?: boolean;
};

export default function FestivalNavSectorTabs({
  sectors,
  activeIndex,
  onChange,
  flush = false,
}: FestivalNavSectorTabsProps) {
  return (
    <div
      className={cn(
        "no-scrollbar flex shrink-0 gap-2 overflow-x-auto py-2",
        !flush && "px-4",
      )}
    >
      <button
        className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
          activeIndex === -1
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-muted-foreground border-border hover:border-primary/50"
        }`}
        onClick={() => onChange(-1)}
      >
        Todos
      </button>
      {sectors.map((sector, i) => (
        <button
          key={sector.id}
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
            i === activeIndex
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary/50"
          }`}
          onClick={() => onChange(i)}
        >
          {sector.name}
        </button>
      ))}
    </div>
  );
}
