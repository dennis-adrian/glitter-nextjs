"use client";

import { ProfileType } from "@/app/api/users/definitions";
import { Dropzone } from "@/app/components/organisms/dropzone";
import UploadAreaCard from "@/app/components/organisms/participant-products-upload/upload-area-card";
import UploadProductModal from "@/app/components/organisms/participant-products-upload/upload-product-modal";
import { ReservationParticipant } from "@/app/lib/participations/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

export const UploadProductFormSchema = z.object({
	name: z.string().min(1, { message: "El nombre es requerido" }),
	description: z.string().optional(),
});

type ParticipantProductsUploadProps = {
	profile: ProfileType;
	participation: ReservationParticipant;
};

export function ParticipantProductsUpload({
	profile,
	participation,
}: ParticipantProductsUploadProps) {
	const [showProductModal, setShowProductModal] = useState(false);
	const [currentImage, setCurrentImage] = useState<File | null>(null);
	const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
	const form = useForm<z.infer<typeof UploadProductFormSchema>>({
		resolver: zodResolver(UploadProductFormSchema),
		defaultValues: {
			name: "",
			description: "",
		},
	});
	const maxFileSize = 4 * 1024 * 1024;

	const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif"];

		if (file) {
			if (!allowedTypes.includes(file.type)) {
				toast.error("El archivo debe ser una imagen");
				return;
			}

			if (file.size > maxFileSize) {
				toast.error(
					`El archivo debe ser menor a ${maxFileSize / 1024 / 1024}MB`,
				);
				return;
			}

			setCurrentImage(file);
			setShowProductModal(true);
		}
	};

	const resetModal = () => {
		setCurrentImage(null);
		setUploadedImageUrl(null);
		form.reset();
	};

	const handleToggleProductModal = (open: boolean) => {
		setShowProductModal(open);
		if (!open) resetModal();
	};

	return (
		<div>
			<UploadAreaCard
				handleImageChange={handleImageChange}
				maxFileSize={maxFileSize}
			/>
			<UploadProductModal
				show={showProductModal}
				userId={profile.id}
				participationId={participation.id}
				currentImage={currentImage}
				onOpenChange={handleToggleProductModal}
				onClose={() => {
					setShowProductModal(false);
				}}
				uploadedImageUrl={uploadedImageUrl}
				setUploadedImageUrl={setUploadedImageUrl}
				form={form}
			/>
		</div>
	);
}
