"use client";

import Image from "next/image";
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

type ProofImageModalProps = {
	imageUrl: string;
	participantName: string;
};

export default function ProofImageModal({
	imageUrl,
	participantName,
}: ProofImageModalProps) {
	const [open, setOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");

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
				<div className="flex justify-center p-4">
					<div className="relative w-full max-w-sm aspect-square">
						<Image
							src={imageUrl}
							alt={`Prueba de ${participantName}`}
							fill
							className="object-contain rounded-md"
							unoptimized
						/>
					</div>
				</div>
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
