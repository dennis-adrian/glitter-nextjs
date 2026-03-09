"use client";

import { Loader2Icon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { submitOrderPaymentVoucher } from "@/app/lib/orders/actions";
import { useUploadThing } from "@/app/vendors/uploadthing";

type Phase = "idle" | "selected" | "uploading" | "saving" | "done" | "error";

type Props = {
	orderId: number;
	endpoint: "storeOrderPayment";
};

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MobilePaymentBar({ orderId, endpoint }: Props) {
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
	const [phase, setPhase] = useState<Phase>("idle");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const router = useRouter();

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
			setPhase("selected");
		},
		[previewUrl],
	);

	function handleClear() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setSelectedFile(null);
		setPreviewUrl(null);
		setUploadedUrl(null);
		setPhase("idle");
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	async function handleConfirm() {
		let imageUrl = uploadedUrl;

		if (!imageUrl) {
			if (!selectedFile) return;
			setPhase("uploading");
			try {
				const res = await startUpload([selectedFile]);
				if (!res?.[0]) {
					toast.error("Error al subir la imagen. Intentá de nuevo.");
					setPhase("error");
					return;
				}
				imageUrl = res[0].serverData?.results?.imageUrl ?? null;
				if (!imageUrl) {
					toast.error("Error al subir la imagen. Intentá de nuevo.");
					setPhase("error");
					return;
				}
				setUploadedUrl(imageUrl);
			} catch {
				toast.error("Error al subir la imagen. Intentá de nuevo.");
				setPhase("error");
				return;
			}
		}

		setPhase("saving");
		try {
			const result = await submitOrderPaymentVoucher(orderId, imageUrl);
			if (result.success) {
				toast.success("¡Pago confirmado! Lo revisaremos pronto.");
				setPhase("done");
				router.push("/my_orders");
			} else {
				toast.error(result.message);
				setPhase("error");
			}
		} catch {
			toast.error("No se pudo confirmar el pago. Intentá de nuevo.");
			setPhase("error");
		}
	}

	const isProcessing = phase === "uploading" || phase === "saving";

	const progressWidth =
		phase === "uploading" ? "50%" : phase === "saving" ? "90%" : "0%";

	const buttonLabel =
		phase === "uploading"
			? "Subiendo imagen..."
			: phase === "saving"
				? "Confirmando pago..."
				: phase === "selected" || phase === "error"
					? "Confirmar pago"
					: "Subir comprobante de pago";

	if (phase === "done") return null;

	return (
		<div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t">
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

			{/* Progress bar */}
			{isProcessing && (
				<div className="h-1 bg-muted overflow-hidden">
					<div
						className="h-full bg-purple-500 transition-all duration-700 ease-in-out"
						style={{ width: progressWidth }}
					/>
				</div>
			)}

			{/* Preview row */}
			{(phase === "selected" || isProcessing || phase === "error") &&
				previewUrl &&
				selectedFile && (
					<div className="flex items-center gap-3 px-4 pt-3 pb-1 animate-in slide-in-from-bottom-3 fade-in duration-200">
						<div className="shrink-0 w-12 h-16 rounded overflow-hidden border bg-muted">
							<Image
								src={previewUrl}
								alt="Vista previa"
								width={48}
								height={64}
								className="w-full h-full object-cover"
							/>
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-xs font-medium truncate">
								{selectedFile.name}
							</p>
							<p className="text-xs text-muted-foreground">
								{formatBytes(selectedFile.size)}
							</p>
						</div>
						<Button
							variant="ghost"
							size="icon"
							onClick={handleClear}
							disabled={isProcessing}
							aria-label="Eliminar imagen"
						>
							<Trash2Icon className="h-4 w-4" />
						</Button>
					</div>
				)}

			{/* CTA button */}
			<div className="px-4 py-3">
				<Button
					className="w-full bg-primary hover:bg-primary/90"
					disabled={isProcessing}
					onClick={
						phase === "idle"
							? () => fileInputRef.current?.click()
							: handleConfirm
					}
				>
					{isProcessing ? (
						<span className="flex items-center gap-2">
							<Loader2Icon className="h-4 w-4 animate-spin" />
							{buttonLabel}
						</span>
					) : (
						buttonLabel
					)}
				</Button>
			</div>
		</div>
	);
}
