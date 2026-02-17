"use client";

import { UserCategory } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { Card } from "@/app/components/ui/card";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { cn } from "@/app/lib/utils";
import { CheckCircle2Icon, XCircleIcon } from "lucide-react";

type SectorCardProps = {
	sector: FestivalSectorWithStandsWithReservationsWithParticipants;
	isSelected: boolean;
	onSelect: () => void;
	profileCategory: UserCategory;
};

export default function SectorCard({
	sector,
	isSelected,
	onSelect,
	profileCategory,
}: SectorCardProps) {
	const categoryStands = sector.stands.filter(
		(s) => s.standCategory === profileCategory,
	);
	const price = categoryStands[0]?.price ?? 0;
	const availableStands = categoryStands.filter(
		(s) => s.status === "available",
	).length;

	const isDisabled = availableStands === 0;

	return (
		<Card
			role="button"
			aria-disabled={isDisabled}
			aria-pressed={isSelected}
			tabIndex={isDisabled ? -1 : 0}
			onClick={() => {
				if (!isDisabled) onSelect();
			}}
			onKeyDown={(e) => {
				if (isDisabled) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
			className={cn(
				"relative w-full rounded-xl border-2 p-4 text-left transition-all",
				isDisabled ? "pointer-events-none opacity-50" : "cursor-pointer",
				isSelected
					? "border-primary bg-primary/5 shadow-md"
					: "border-border hover:border-muted-foreground/40",
			)}
		>
			{isSelected && (
				<Badge className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide">
					Seleccionado
				</Badge>
			)}

			<div className="flex items-start justify-between gap-2 pr-24">
				<div className="flex flex-col gap-0.5">
					<h3 className="text-base font-semibold leading-tight">
						{sector.name}
					</h3>
					{sector.description && (
						<p className="text-xs text-muted-foreground">
							{sector.description}
						</p>
					)}
				</div>
			</div>

			<div className="absolute top-4 right-3 text-right">
				{!isSelected && (
					<>
						<p className="text-base font-bold">Bs. {price}</p>
						<p className="text-xs tracking-wide text-muted-foreground">
							por espacio
						</p>
					</>
				)}
			</div>

			<div className="mt-3 flex items-center gap-1.5">
				{availableStands > 0 ? (
					<>
						<CheckCircle2Icon className="h-4 w-4 text-green-600" />
						<span className="text-sm text-green-700">
							{availableStands} stands disponibles
						</span>
					</>
				) : (
					<>
						<XCircleIcon className="h-4 w-4 text-destructive" />
						<span className="text-sm text-destructive">
							No hay stands disponibles
						</span>
					</>
				)}
			</div>
		</Card>
	);
}
