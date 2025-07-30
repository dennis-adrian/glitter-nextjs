import TextInput from "@/app/components/form/fields/text";
import { UploadProductFormSchema } from "@/app/components/organisms/participant-products-upload";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { Progress } from "@/app/components/ui/progress";
import { createParticipantProduct } from "@/app/lib/participant_products/actions";
import { cn } from "@/app/lib/utils";
import { useUploadThing } from "@/app/vendors/uploadthing";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { CloudUploadIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

type UploadProductModalProps = {
	currentImage: File | null;
	form: UseFormReturn<z.infer<typeof UploadProductFormSchema>>;
	participationId: number;
	show: boolean;
	uploadedImageUrl: string | null;
	userId: number;
	setUploadedImageUrl: (url: string | null) => void;
	onClose: () => void;
	onOpenChange: (open: boolean) => void;
};

export default function UploadProductModal({
	currentImage,
	form,
	participationId,
	show,
	uploadedImageUrl,
	userId,
	setUploadedImageUrl,
	onClose,
	onOpenChange,
}: UploadProductModalProps) {
	const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<number>(0);
	const { isUploading, startUpload } = useUploadThing("imageUploader", {
		onClientUploadComplete(res) {
			setUploadedImageUrl(res[0].url);
			setUploadProgress(0);
		},
		onUploadProgress(progress) {
			setUploadProgress(progress);
		},
	});

	// Handle mobile keyboard detection
	useEffect(() => {
		const handleResize = () => {
			const viewportHeight = window.innerHeight;
			const screenHeight = screen.height;

			// Detect if keyboard is open (simplified heuristic)
			const keyboardThreshold = screenHeight * 0.75;
			setIsKeyboardOpen(viewportHeight < keyboardThreshold);
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	const action = form.handleSubmit(async (formData) => {
		if (!currentImage) {
			return;
		}

		// this variable is used to store the image url right after the upload is complete
		// we can't use the uploadedImageUrl because it's not updated yet in the state
		let imageUrl: string | null = null;
		if (!uploadedImageUrl) {
			const imageUploadResponse = await startUpload([currentImage]);
			if (imageUploadResponse) {
				imageUrl = imageUploadResponse[0].url;

				if (!imageUrl) {
					toast.error("Error al subir la imagen, intenta nuevamente");
					return;
				}
			}
		}

		if (!imageUrl) {
			toast.error("No hay imagen para subir.");
			return;
		}

		const result = await createParticipantProduct({
			...formData,
			participationId: participationId,
			userId: userId,
			imageUrl,
		});

		if (result.success) {
			toast.success(result.message);
			onClose();
		} else {
			toast.error(result.message);
		}
	});

	return (
		<Dialog open={show} onOpenChange={onOpenChange}>
			<DialogContent
				className={cn(
					"gap-3 max-w-md mx-auto max-h-[90vh] overflow-y-auto",
					"transition-all duration-300 ease-in-out",
					isKeyboardOpen && "max-h-[60vh]",
				)}
			>
				<DialogHeader className="flex flex-col">
					<DialogTitle className="text-xl md:text-2xl font-semibold">
						Agregar Producto
					</DialogTitle>
					<DialogDescription className="text-muted-foreground">
						Agrega los detalles del producto.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3 w-full">
					<div className="relative w-[120px] h-[120px] md:w-[180px] md:h-[180px] mx-auto border border-gray-200 rounded-lg">
						{currentImage && (
							<Image
								className="object-contain"
								src={URL.createObjectURL(currentImage)}
								alt="Product image"
								fill
							/>
						)}
						<div className="absolute bottom-2 right-2">
							<CloudUploadIcon
								className={cn(
									"w-5 h-5",
									!isUploading && "animate-pulse",
									uploadedImageUrl && "animate-none text-emerald-500",
									!uploadedImageUrl && "animate-none text-gray-500",
								)}
							/>
						</div>
					</div>
					{isUploading && <Progress className="h-1" value={uploadProgress} />}
					<Form {...form}>
						<form className="flex flex-col gap-3" onSubmit={action}>
							<TextInput
								formControl={form.control}
								name="name"
								label="Nombre del producto*"
								placeholder="Escribe el nombre del producto"
							/>
							<TextInput
								formControl={form.control}
								name="description"
								label="Descripción (opcional)"
								placeholder="Escribe una descripción corta"
							/>
							<SubmitButton
								label="Agregar Producto"
								disabled={form.formState.isSubmitting || !currentImage}
								loading={form.formState.isSubmitting}
							/>
						</form>
					</Form>
				</div>
			</DialogContent>
		</Dialog>
	);
}
