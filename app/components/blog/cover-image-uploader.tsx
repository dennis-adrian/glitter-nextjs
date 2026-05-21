"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";

import { Button } from "@/app/components/ui/button";
import { UploadDropzone } from "@/app/vendors/uploadthing";

type Props = {
	value: string | null | undefined;
	onChange: (url: string | null) => void;
};

export default function CoverImageUploader({ value, onChange }: Props) {
	if (value) {
		return (
			<div className="space-y-2">
				<div className="relative w-full overflow-hidden rounded-md border bg-muted aspect-[16/9]">
					<Image
						src={value}
						alt="Portada del artículo"
						fill
						className="object-cover"
						sizes="(max-width: 768px) 100vw, 768px"
					/>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => onChange(null)}
				>
					<Trash2 className="h-4 w-4 mr-2" />
					Quitar portada
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<UploadDropzone
				endpoint="blogImage"
				config={{ mode: "auto" }}
				content={{
					label: "Arrastra una imagen o haz clic para subir",
					button: ({ ready }) =>
						ready ? "Subir portada" : "Cargando…",
				}}
				appearance={{
					container:
						"border-dashed border-2 border-muted-foreground/40 rounded-md p-6 bg-white",
					button:
						"ut-ready:bg-pink-600 ut-uploading:bg-pink-400 bg-pink-600 text-white px-4 py-2 rounded-md",
					allowedContent: "text-xs text-muted-foreground",
				}}
				onClientUploadComplete={(res) => {
					const url = res?.[0]?.serverData?.imageUrl;
					if (url) onChange(url);
				}}
				onUploadError={(err) => {
					console.error("Cover upload error", err);
				}}
			/>
			<p className="text-xs text-muted-foreground">
				Recomendado: 16:9, máximo 4 MB.
			</p>
		</div>
	);
}
