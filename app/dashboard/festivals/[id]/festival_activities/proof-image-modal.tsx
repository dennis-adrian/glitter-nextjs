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
	imageUrl: string | null;
	participantName: string;
	materialLabel: string;
};

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ProofImageModal({
	imageUrl,
	participantName,
	materialLabel,
}: ProofImageModalProps) {
	const [open, setOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");

	if (!imageUrl) return null;

	const title = `${capitalize(materialLabel)} de ${participantName}`;

	return (
		<DrawerDialog open={open} onOpenChange={setOpen} isDesktop={isDesktop}>
			<DrawerDialogTrigger isDesktop={isDesktop}>
				<Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
					<EyeIcon className="w-3.5 h-3.5 mr-1" />
					Ver {materialLabel}
				</Button>
			</DrawerDialogTrigger>
			<DrawerDialogContent isDesktop={isDesktop}>
				<DrawerDialogHeader isDesktop={isDesktop}>
					<DrawerDialogTitle isDesktop={isDesktop}>
						{title}
					</DrawerDialogTitle>
				</DrawerDialogHeader>
				<div className="flex justify-center p-4">
					<div className="relative w-full max-w-sm aspect-square">
						<Image
							src={imageUrl}
							alt={title}
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
