import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { cn } from "@/app/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

type UploadProductModalProps = {
	show: boolean;
	onOpenChange: (open: boolean) => void;
	currentImage: File | null;
};

export default function UploadProductModal({
	show,
	onOpenChange,
	currentImage,
}: UploadProductModalProps) {
	const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
	const form = useForm();

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

	const action = form.handleSubmit((data) => {
		console.log(data);
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
								src={URL.createObjectURL(currentImage)}
								alt="Product image"
								fill
								objectFit="contain"
							/>
						)}
					</div>
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
								disabled={false}
								loading={false}
							/>
						</form>
					</Form>
				</div>
			</DialogContent>
		</Dialog>
	);
}
