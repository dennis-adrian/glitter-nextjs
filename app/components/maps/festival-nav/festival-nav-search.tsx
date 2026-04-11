"use client";

import { useRef, useState } from "react";
import { Search } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";

export type ParticipantSearchEntry = {
	displayName: string;
	imageUrl: string | null;
	standLabel: string;
	sectorName: string;
	sectorIndex: number;
	stand: StandWithReservationsWithParticipants;
};

type FestivalNavSearchProps = {
	entries: ParticipantSearchEntry[];
	onSelect: (entry: ParticipantSearchEntry) => void;
};

export default function FestivalNavSearch({
	entries,
	onSelect,
}: FestivalNavSearchProps) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const normalized = query.trim().toLowerCase();
	const results =
		normalized.length > 0
			? entries.filter(
					(e) =>
						e.displayName.toLowerCase().includes(normalized) ||
						e.standLabel.toLowerCase().includes(normalized),
				)
			: [];

	function handleSelect(entry: ParticipantSearchEntry) {
		setQuery("");
		setOpen(false);
		onSelect(entry);
	}

	return (
		<div className="relative shrink-0 px-4 py-2">
			<div className="relative flex items-center">
				<Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
				<input
					ref={inputRef}
					type="text"
					placeholder="Buscar participante..."
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onBlur={() => {
						// Delay so click on result fires before blur closes the dropdown
						setTimeout(() => setOpen(false), 150);
					}}
					className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
				/>
			</div>

			{open && results.length > 0 && (
				<ul className="absolute left-4 right-4 top-full mt-1 z-50 rounded-lg border border-border bg-background shadow-lg overflow-hidden max-h-60 overflow-y-auto">
					{results.map((entry, i) => (
						<li key={`${entry.stand.id}-${i}`}>
							<button
								className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors"
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => handleSelect(entry)}
							>
								<Avatar className="h-8 w-8 shrink-0">
									<AvatarImage
										src={entry.imageUrl ?? undefined}
										alt={entry.displayName}
									/>
								</Avatar>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium truncate">
										{entry.displayName}
									</p>
									<p className="text-xs text-muted-foreground">
										Stand {entry.standLabel} · {entry.sectorName}
									</p>
								</div>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
