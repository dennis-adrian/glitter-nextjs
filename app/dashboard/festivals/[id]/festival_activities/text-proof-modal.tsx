"use client";

import { useState } from "react";
import { EyeIcon } from "lucide-react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/app/components/ui/button";
import {
	DrawerDialog,
	DrawerDialogContent,
	DrawerDialogHeader,
	DrawerDialogTitle,
	DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";

type TextProofModalProps = {
	participantName: string;
	promoDescription: string | null;
	promoConditions: string | null;
};

export default function TextProofModal({
	participantName,
	promoDescription,
	promoConditions,
}: TextProofModalProps) {
	const [open, setOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");

	const hasText =
		(promoDescription && promoDescription.trim() !== "") ||
		(promoConditions && promoConditions.trim() !== "");

	if (!hasText) return null;

	return (
		<DrawerDialog open={open} onOpenChange={setOpen} isDesktop={isDesktop}>
			<DrawerDialogTrigger isDesktop={isDesktop}>
				<Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
					<EyeIcon className="w-3.5 h-3.5 mr-1" />
					Ver prueba
				</Button>
			</DrawerDialogTrigger>
			<DrawerDialogContent isDesktop={isDesktop}>
				<DrawerDialogHeader isDesktop={isDesktop}>
					<DrawerDialogTitle isDesktop={isDesktop}>
						Prueba de {participantName}
					</DrawerDialogTitle>
				</DrawerDialogHeader>
				<div className="max-h-[60vh] overflow-y-auto space-y-4 p-1">
					{promoDescription && promoDescription.trim() !== "" && (
						<div>
							<p className="text-xs font-medium text-muted-foreground mb-1">
								Promoción
							</p>
							<p className="text-sm whitespace-pre-wrap">{promoDescription}</p>
						</div>
					)}
					{promoConditions && promoConditions.trim() !== "" && (
						<div>
							<p className="text-xs font-medium text-muted-foreground mb-1">
								Condiciones
							</p>
							<p className="text-sm whitespace-pre-wrap">{promoConditions}</p>
						</div>
					)}
				</div>
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
