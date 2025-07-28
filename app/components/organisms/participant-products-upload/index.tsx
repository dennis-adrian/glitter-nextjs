"use client";

import { ProfileType } from "@/app/api/users/definitions";
import UploadAreaCard from "@/app/components/organisms/participant-products-upload/upload-area-card";
import UploadProductModal from "@/app/components/organisms/participant-products-upload/upload-product-modal";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { ReservationParticipant } from "@/app/lib/participations/definitions";
import { useState } from "react";
import { toast } from "sonner";

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
				onOpenChange={setShowProductModal}
				onClose={() => {
					setCurrentImage(null);
					setShowProductModal(false);
				}}
			/>
		</div>
	);
}
