import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";

type FestivalNavSectorTabsProps = {
	sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
	activeIndex: number; // -1 = all sectors
	onChange: (index: number) => void;
};

export default function FestivalNavSectorTabs({
	sectors,
	activeIndex,
	onChange,
}: FestivalNavSectorTabsProps) {
	return (
		<div className="flex gap-2 overflow-x-auto px-4 py-2 shrink-0 no-scrollbar">
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
