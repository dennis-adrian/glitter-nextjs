"use client";

import { ProfileType } from "@/app/api/users/definitions";
import UploadAreaCard from "@/app/components/organisms/participant-products-upload/upload-area-card";
import UploadProductModal from "@/app/components/organisms/participant-products-upload/upload-product-modal";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { useState } from "react";

type ParticipantProductsUploadProps = {
	profile: ProfileType;
	festival: FestivalBase;
};

export function ParticipantProductsUpload({
	profile,
}: ParticipantProductsUploadProps) {
	const [showProductModal, setShowProductModal] = useState(false);
	const [currentImage, setCurrentImage] = useState<File | null>(null);

	const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setCurrentImage(e.target.files?.[0] || null);
		setShowProductModal(true);
	};

	return (
		<div>
			<UploadAreaCard handleImageChange={handleImageChange} />
			<UploadProductModal
				show={showProductModal}
				onOpenChange={setShowProductModal}
				currentImage={currentImage}
			/>
		</div>
	);
}
