"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import { useUploadThing } from "@/app/vendors/uploadthing";

export default function PaymentProofUpload({
	voucherImageUrl,
	onUploadComplete,
	onUploading,
	endpoint = "reservationPayment",
	submitLabel = "Confirmar pago",
}: {
	voucherImageUrl?: string;
	onUploadComplete: (imageUrl: string) => Promise<void> | void;
	onUploading: (isUploading: boolean) => void;
	endpoint?: "reservationPayment" | "storeOrderPayment";
	submitLabel?: string;
}) {
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { startUpload } = useUploadThing(endpoint);

	useEffect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	const handleFileChange = useCallback(
		(file: File) => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
			setSelectedFile(file);
			setPreviewUrl(URL.createObjectURL(file));
		},
		[previewUrl],
	);

	async function handleConfirm() {
		if (!selectedFile) return;
		setIsUploading(true);
		onUploading(true);
		try {
			const res = await startUpload([selectedFile]);
			if (!res || !res[0]) {
				toast.error("Error al subir el comprobante. Intentá de nuevo.");
				return;
			}
			const imageUrl = res[0].serverData?.results?.imageUrl;
			if (!imageUrl) {
				toast.error("Error al subir el comprobante. Intentá de nuevo.");
				return;
			}
			await onUploadComplete(imageUrl);
		} catch {
			toast.error("Error al subir el comprobante. Intentá de nuevo.");
		} finally {
			setIsUploading(false);
			onUploading(false);
		}
	}

	if (voucherImageUrl) {
		return (
			<Image
				className="mx-auto rounded-md border"
				src={voucherImageUrl}
				alt="Comprobante de pago"
				width={300}
				height={400}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) handleFileChange(file);
				}}
			/>

			{previewUrl ? (
				<div className="flex flex-col gap-3">
					<Image
						src={previewUrl}
						alt="Vista previa del comprobante"
						width={260}
						height={340}
						className="mx-auto rounded-md border object-cover"
					/>
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						disabled={isUploading}
						className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors text-center disabled:pointer-events-none"
					>
						Cambiar imagen
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 text-center border-primary-300 hover:bg-primary-50/50 transition-colors cursor-pointer"
				>
					<UploadIcon className="h-8 w-8 text-muted-foreground/50" />
					<span className="text-sm font-medium text-muted-foreground">
						Presioná o haz clic para elegir una imagen
					</span>
					<span className="text-xs text-muted-foreground/70">
						JPG, PNG o HEIC — hasta 4MB
					</span>
				</button>
			)}

			<Button
				onClick={handleConfirm}
				disabled={!selectedFile || isUploading}
				className="w-full bg-primary hover:bg-primary/90"
			>
				{isUploading ? (
					<span className="flex items-center gap-2">
						<Loader2Icon className="h-4 w-4 animate-spin" />
						Subiendo...
					</span>
				) : (
					submitLabel
				)}
			</Button>
		</div>
	);
}
