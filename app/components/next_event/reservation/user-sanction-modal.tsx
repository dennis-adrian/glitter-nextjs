"use client";

import { Button } from "@/app/components/ui/button";
import {
	DrawerDialog,
	DrawerDialogTitle,
	DrawerDialogHeader,
	DrawerDialogContent,
	DrawerDialogFooter,
	DrawerDialogClose,
} from "@/app/components/ui/drawer-dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { mapSanctionToDisplaySanction } from "@/app/lib/controllers/reservations/utils";
import { UserSanctionFull } from "@/app/lib/users/definitions";
import { cn } from "@/app/lib/utils";
import { InfoIcon } from "lucide-react";

export function UserSanctionModal({
	userSanctions,
	open,
	onOpenChange,
}: {
	userSanctions: UserSanctionFull[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const infractions = userSanctions.map((sanction) => sanction.infraction);

	return (
		<DrawerDialog open={open} onOpenChange={onOpenChange}>
			<DrawerDialogContent>
				<DrawerDialogHeader>
					<DrawerDialogTitle>Tu perfil ha sido sancionado</DrawerDialogTitle>
				</DrawerDialogHeader>
				<div
					className={cn(
						"flex flex-col gap-4 text-sm md:text-base",
						isDesktop ? "" : "px-4",
					)}
				>
					<div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
						<InfoIcon className="w-9 h-9  text-amber-500" />
					</div>
					<p>
						Cometiste infracciones en anteriores festivales y tu perfil debe
						cumplir con una sanción antes de poder reservar un espacio en este
						festival.
					</p>

					<div className="flex flex-col gap-2">
						<p className="font-semibold">
							{infractions.length > 1 ? "Infracciones:" : "Infracción:"}
						</p>
						{infractions.map((infraction) => (
							<span key={infraction.id}>
								<ul>
									<li>{infraction.type.label}</li>
								</ul>
							</span>
						))}
					</div>

					<div className="flex flex-col gap-2">
						<p className="font-semibold">
							{userSanctions.length > 1
								? "Sanciones aplicadas:"
								: "Sanción aplicada:"}
						</p>
						{userSanctions.map(mapSanctionToDisplaySanction).map((sanction) => (
							<ul key={sanction.id}>
								<li>
									<span className="font-medium">Tipo:</span> {sanction.type}
								</li>
								<li>
									<span className="font-medium">Descripción:</span>{" "}
									{sanction.description}
								</li>
								<li>
									<span className="font-medium">Duración:</span>{" "}
									{sanction.duration}
								</li>
							</ul>
						))}
					</div>
				</div>
				<DrawerDialogFooter>
					<Button className="w-full" onClick={() => onOpenChange(false)}>
						Entendido
					</Button>
				</DrawerDialogFooter>
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
