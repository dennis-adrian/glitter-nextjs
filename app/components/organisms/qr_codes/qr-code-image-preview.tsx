"use client";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/components/ui/dialog";
import Image from "next/image";
import { useState } from "react";

type Props = {
	imageUrl: string;
	alt?: string;
};

export default function QrCodeImagePreview({ imageUrl, alt }: Props) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<button
					type="button"
					className="relative h-12 w-12 overflow-hidden rounded-md border bg-white hover:opacity-80"
					aria-label="Ver imagen del código QR"
				>
					<Image
						src={imageUrl}
						alt={alt ?? "Código QR"}
						fill
						sizes="48px"
						className="object-contain"
						loading="lazy"
					/>
				</button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Vista previa del código QR</DialogTitle>
				</DialogHeader>
				<div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-md bg-white">
					<Image
						src={imageUrl}
						alt={alt ?? "Código QR"}
						fill
						sizes="(max-width: 768px) 90vw, 384px"
						className="object-contain"
						loading="lazy"
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
