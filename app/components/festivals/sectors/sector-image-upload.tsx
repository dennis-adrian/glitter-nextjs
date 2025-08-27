"use client";

import { cn } from "@/app/lib/utils";
import { UploadButton } from "@/app/vendors/uploadthing";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import type { UploadThingError } from "uploadthing/server";
import type { Json } from "@uploadthing/shared";
import { slugify } from "@/app/lib/formatters";

export default function SectorImageUpload({
	imageUrl,
	setImageUrl,
	sectorName,
	onUploading,
}: {
	imageUrl: string | null;
	setImageUrl: (imageUrl: string) => void;
	sectorName: string;
	onUploading?: (isUploading: boolean) => void;
}) {
	const fileName = `${slugify(sectorName)}_image`;

	return (
		<div className="flex flex-col items-center justify-center">
			<div className={cn("relative mb-4 border border-dashed w-full h-48")}>
				<Image
					className="object-cover"
					alt={`Imagen del sector ${sectorName}`}
					src={imageUrl || "/img/placeholder-image.png"}
					sizes="(max-width: 640px) 100vw, 240px"
					fill
				/>
			</div>
			<UploadButton
				config={{ cn: twMerge }}
				content={{
					button({ ready, isUploading, uploadProgress }) {
						if (isUploading && uploadProgress === 100) {
							return (
								<Loader2Icon className="w-4 h-4 text-primary-500 animate-spin" />
							);
						}
						if (isUploading) return <div>{uploadProgress}%</div>;
						if (ready) return <div>Elige una imagen</div>;
						return "Cargando...";
					},
					allowedContent({ ready, isUploading }) {
						if (!ready) return null;
						if (isUploading) return "Subiendo imagen...";
						return "Imagen hasta 4MB";
					},
				}}
				appearance={{
					button: ({ ready, isUploading }) => {
						if (!ready) {
							return "bg-transparent text-xs text-muted-foreground border";
						}
						if (isUploading) {
							return "bg-transparent text-xs text-muted-foreground border after:bg-primary-400/60";
						}
						return "bg-transparent text-xs text-foreground border hover:text-primary-500 hover:border-primary-500";
					},
				}}
				endpoint="imageUploader"
				onBeforeUploadBegin={(files) => {
					if (onUploading) onUploading(true);
					return files.map((f) => {
						const fileExtension = f.name.split(".").pop();
						return new File([f], `${fileName}.${fileExtension}`, {
							type: f.type,
						});
					});
				}}
				onClientUploadComplete={(res) => {
					if (onUploading) onUploading(false);
					if (res && res.length > 0 && res[0].url) {
						toast.success("Imagen subida correctamente");
						setImageUrl(res[0].url);
					}
				}}
				onUploadError={(
					error: Pick<UploadThingError<Json>, "code" | "message">,
				) => {
					if (onUploading) onUploading(false);
					const errorMessage = error.message;
					if (
						error.code === "TOO_LARGE" ||
						errorMessage.includes("FileSizeMismatch")
					) {
						toast.error("La imagen es demasiado grande. Máximo 4MB.");
					} else {
						toast.error("Error al subir la imagen");
					}
				}}
			/>
		</div>
	);
}
