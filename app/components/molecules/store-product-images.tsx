"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

const MIN_SWIPE_DISTANCE = 50;

type StoreProductImagesProps = {
	productName: string;
	stock: number;
	images: string[];
	isHovered: boolean;
};
export default function StoreProductImages({
	productName,
	stock,
	images,
	isHovered,
}: StoreProductImagesProps) {
	const [currentImageIndex, setCurrentImageIndex] = useState(0);
	const [touchStart, setTouchStart] = useState<number | null>(null);
	const [touchEnd, setTouchEnd] = useState<number | null>(null);

	const nextImage = (e?: React.MouseEvent) => {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		setCurrentImageIndex((prev) => (prev + 1) % images.length);
	};

	const prevImage = (e?: React.MouseEvent) => {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
	};

	const onTouchStart = (e: React.TouchEvent) => {
		setTouchEnd(null); // Reset touch end
		setTouchStart(e.targetTouches[0].clientX);
	};

	const onTouchMove = (e: React.TouchEvent) => {
		setTouchEnd(e.targetTouches[0].clientX);
	};

	const onTouchEnd = () => {
		if (!touchStart || !touchEnd) return;
		const distance = touchStart - touchEnd;
		const isLeftSwipe = distance > MIN_SWIPE_DISTANCE;
		const isRightSwipe = distance < -MIN_SWIPE_DISTANCE;
		if (isLeftSwipe) {
			nextImage();
		}
		if (isRightSwipe) {
			prevImage();
		}
	};
	return (
		<div
			className={`aspect-square relative overflow-hidden bg-muted ${(stock ?? 0) <= 0 ? "opacity-60" : ""}`}
			onTouchStart={onTouchStart}
			onTouchMove={onTouchMove}
			onTouchEnd={onTouchEnd}
		>
			<Image
				src={images[currentImageIndex] || "/placeholder.svg"}
				alt={`${productName} - Image ${currentImageIndex + 1}`}
				fill
				className="object-cover group-hover:scale-105 transition-transform duration-300 select-none"
				draggable={false}
			/>

			{images.length > 1 && (
				<>
					<button
						onClick={prevImage}
						className={`absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1 rounded-full transition-opacity duration-200 ${
							isHovered ? "opacity-100" : "opacity-0"
						}`}
						aria-label="Previous image"
					>
						<ChevronLeftIcon className="h-4 w-4" />
					</button>
					<button
						onClick={nextImage}
						className={`absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1 rounded-full transition-opacity duration-200 ${
							isHovered ? "opacity-100" : "opacity-0"
						}`}
						aria-label="Next image"
					>
						<ChevronRightIcon className="h-4 w-4" />
					</button>
					<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 py-1 px-2 rounded-full bg-black/30 backdrop-blur-[2px]">
						{images.map((_, idx) => (
							<div
								key={idx}
								className={`h-1.5 w-1.5 rounded-full transition-all shadow-sm ${
									idx === currentImageIndex
										? "bg-white scale-110"
										: "bg-white/50 hover:bg-white/75"
								}`}
								onClick={() => setCurrentImageIndex(idx)}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}
