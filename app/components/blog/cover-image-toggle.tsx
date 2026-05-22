"use client";

import { ImagePlus, Pencil, Trash2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import CoverImageUploader from "@/app/components/blog/cover-image-uploader";
import { Button } from "@/app/components/ui/button";

type Props = {
	value: string | null | undefined;
	onChange: (url: string | null) => void;
	disabled?: boolean;
};

export default function CoverImageToggle({ value, onChange, disabled }: Props) {
	const [expanded, setExpanded] = useState(false);

	if (value) {
		return (
			<div className="group relative w-full overflow-hidden rounded-md border bg-muted aspect-video">
				<Image
					src={value}
					alt="Portada del artículo"
					fill
					className="object-cover"
					sizes="(max-width: 768px) 100vw, 768px"
				/>
				{!disabled && (
					<div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => {
								onChange(null);
								setExpanded(true);
							}}
						>
							<Pencil className="mr-1 h-3.5 w-3.5" />
							Cambiar
						</Button>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => onChange(null)}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
					</div>
				)}
			</div>
		);
	}

	if (expanded) {
		return (
			<div className="space-y-2">
				<CoverImageUploader value={null} onChange={onChange} />
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setExpanded(false)}
				>
					Cancelar
				</Button>
			</div>
		);
	}

	return (
		<div className="flex justify-center">
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="text-muted-foreground"
				onClick={() => setExpanded(true)}
				disabled={disabled}
			>
				<ImagePlus className="mr-2 h-4 w-4" />
				Portada
			</Button>
		</div>
	);
}
