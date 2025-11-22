"use client";

import { Button } from "@/app/components/ui/button";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	Maximize2Icon,
	XIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isZoomed, setIsZoomed] = useState(false);
	const [touchStart, setTouchStart] = useState<number | null>(null);
	const [currentTranslate, setCurrentTranslate] = useState(0);
	const [isDragging, setIsDragging] = useState(false);

	const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
	const [isPanning, setIsPanning] = useState(false);
	const dragStartRef = useRef({ x: 0, y: 0 });
	const hasDraggedRef = useRef(false);

	// Prevent body scroll when modal is open
	useEffect(() => {
		if (isModalOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "unset";
		}
		return () => {
			document.body.style.overflow = "unset";
		};
	}, [isModalOpen]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isModalOpen) {
				closeModal();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isModalOpen]);

	const nextImage = (e?: React.MouseEvent) => {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		if (currentImageIndex < images.length - 1) {
			setCurrentImageIndex((prev) => prev + 1);
		}
	};

	const prevImage = (e?: React.MouseEvent) => {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		if (currentImageIndex > 0) {
			setCurrentImageIndex((prev) => prev - 1);
		}
	};

	const openModal = (e: React.MouseEvent) => {
		e.preventDefault();
		setIsModalOpen(true);
		setIsZoomed(false);
	};

	const closeModal = (e?: React.MouseEvent) => {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		setIsModalOpen(false);
		setIsZoomed(false);
		setPanPosition({ x: 0, y: 0 }); // Reset pan on close
	};

	const toggleZoom = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (hasDraggedRef.current) return;

		if (isZoomed) {
			setIsZoomed(false);
			setPanPosition({ x: 0, y: 0 }); // Reset pan when zooming out
		} else {
			setIsZoomed(true);
		}
	};

	const onModalPointerDown = (e: React.PointerEvent) => {
		if (e.button !== 0) return; // Only left click/touch

		if ((e.target as HTMLElement).closest("button")) return;

		hasDraggedRef.current = false;

		if (isZoomed) {
			e.preventDefault();
			setIsPanning(true);
			// Store offset relative to current pan position
			dragStartRef.current = {
				x: e.clientX - panPosition.x,
				y: e.clientY - panPosition.y,
			};
			e.currentTarget.setPointerCapture(e.pointerId);
		} else {
			// Original swipe logic for image navigation
			setTouchStart(e.clientX);
			setIsDragging(true);
		}
	};

	const onModalPointerMove = (e: React.PointerEvent) => {
		if (isZoomed && isPanning) {
			e.preventDefault();
			const newX = e.clientX - dragStartRef.current.x;
			const newY = e.clientY - dragStartRef.current.y;

			// Check threshold to distinguish click from drag
			if (
				Math.abs(newX - panPosition.x) > 2 ||
				Math.abs(newY - panPosition.y) > 2
			) {
				hasDraggedRef.current = true;
			}

			setPanPosition({ x: newX, y: newY });
		} else if (!isZoomed && isDragging && touchStart !== null) {
			// Existing swipe logic
			const currentTouch = e.clientX;
			const diff = touchStart - currentTouch;
			if (Math.abs(diff) > 5) hasDraggedRef.current = true;
			setCurrentTranslate(diff);
		}
	};

	const onModalPointerUp = (e: React.PointerEvent) => {
		if (isZoomed) {
			setIsPanning(false);
			e.currentTarget.releasePointerCapture(e.pointerId);
		} else {
			// Existing swipe end logic
			setIsDragging(false);
			const threshold = MIN_SWIPE_DISTANCE;

			if (Math.abs(currentTranslate) > threshold) {
				if (currentTranslate > 0 && currentImageIndex < images.length - 1) {
					setCurrentImageIndex((prev) => prev + 1);
				} else if (currentTranslate < 0 && currentImageIndex > 0) {
					setCurrentImageIndex((prev) => prev - 1);
				}
			}

			setTouchStart(null);
			setCurrentTranslate(0);
		}
	};

	const onTouchStart = (e: React.TouchEvent) => {
		setTouchStart(e.targetTouches[0].clientX);
		setIsDragging(true);
	};

	const onTouchMove = (e: React.TouchEvent) => {
		if (!touchStart) return;
		const currentTouch = e.targetTouches[0].clientX;
		const diff = touchStart - currentTouch;
		setCurrentTranslate(diff);
	};

	const onTouchEnd = () => {
		setIsDragging(false);
		const threshold = MIN_SWIPE_DISTANCE; // Minimum distance to trigger slide

		if (Math.abs(currentTranslate) > threshold) {
			if (currentTranslate > 0 && currentImageIndex < images.length - 1) {
				setCurrentImageIndex((prev) => prev + 1);
			} else if (currentTranslate < 0 && currentImageIndex > 0) {
				setCurrentImageIndex((prev) => prev - 1);
			}
		}

		setTouchStart(null);
		setCurrentTranslate(0);
	};

	return (
		<>
			<div
				className={`aspect-square relative overflow-hidden bg-muted ${stock === 0 ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
				onTouchStart={onTouchStart}
				onTouchMove={onTouchMove}
				onTouchEnd={onTouchEnd}
				onClick={(e) => {
					// Prevent modal opening if it was a drag
					if (currentTranslate === 0 && stock > 0) openModal(e);
				}}
			>
				<div
					className="flex h-full transition-transform duration-300 ease-out"
					style={{
						transform: `translateX(calc(-${currentImageIndex * 100}% - ${isDragging ? currentTranslate : 0}px))`,
						transition: isDragging ? "none" : "transform 300ms ease-out",
					}}
				>
					{images.map((img, idx) => (
						<div key={idx} className="min-w-full h-full relative">
							<Image
								src={img || "/img/placeholders/placeholder-300x300.png"}
								alt={`${productName} - Image ${idx + 1}`}
								fill
								className="object-cover select-none"
								draggable={false}
							/>
						</div>
					))}
				</div>

				{stock > 0 && (
					<div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
						<div className="bg-black/50 text-white p-1.5 rounded-full backdrop-blur-sm">
							<Maximize2Icon className="h-4 w-4" />
						</div>
					</div>
				)}

				{images.length > 1 && (
					<>
						<button
							onClick={prevImage}
							className={`absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1 rounded-full transition-opacity duration-200 ${
								isHovered && currentImageIndex > 0 ? "opacity-100" : "opacity-0"
							}`}
							aria-label="Previous image"
							disabled={currentImageIndex === 0}
						>
							<ChevronLeftIcon className="h-4 w-4" />
						</button>
						<button
							onClick={nextImage}
							className={`absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1 rounded-full transition-opacity duration-200 ${
								isHovered && currentImageIndex < images.length - 1
									? "opacity-100"
									: "opacity-0"
							}`}
							aria-label="Next image"
							disabled={currentImageIndex === images.length - 1}
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
								/>
							))}
						</div>
					</>
				)}
			</div>

			{/* Lightbox Modal */}
			{isModalOpen && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200"
					onClick={closeModal}
				>
					<Button
						variant="ghost"
						size="icon"
						className="absolute top-4 right-4 text-white hover:bg-white/20 z-50 rounded-full h-12 w-12 hover:-translate-y-0 hover:text-white"
						onClick={closeModal}
					>
						<XIcon className="h-6 w-6" />
						<span className="sr-only">Close</span>
					</Button>

					<div
						className="relative w-full h-full flex items-center justify-center overflow-hidden touch-none"
						onPointerDown={onModalPointerDown}
						onPointerMove={onModalPointerMove}
						onPointerUp={onModalPointerUp}
						onPointerLeave={onModalPointerUp}
						onClick={toggleZoom} // moved onClick here to catch events from pointer capture
					>
						<div
							className={`relative w-full h-full flex items-center justify-center transition-all duration-300 ${
								isPanning
									? "cursor-grabbing"
									: isZoomed
										? "cursor-grab"
										: "cursor-zoom-in"
							}`}
						>
							<img
								src={
									images[currentImageIndex] ||
									"/img/placeholders/placeholder-300x300.png"
								}
								alt={`${productName} - Full View`}
								className="max-w-[90%] max-h-[90%] object-contain select-none"
								style={{
									transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${isZoomed ? 2 : 1})`,
									transition: isPanning
										? "none"
										: "transform 300ms cubic-bezier(0.2, 0, 0.2, 1)",
								}}
								draggable={false}
							/>
						</div>

						{/* Navigation Controls for Modal */}
						{images.length > 1 && !isZoomed && (
							<>
								<Button
									variant="ghost"
									size="icon"
									className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full h-12 w-12 z-40 hidden md:flex hover:-translate-y-1/2 hover:text-white"
									onClick={(e) => {
										e.stopPropagation();
										prevImage(e);
									}}
								>
									<ChevronLeftIcon className="h-8 w-8" />
								</Button>

								<Button
									variant="ghost"
									size="icon"
									className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full h-12 w-12 z-40 hidden md:flex hover:-translate-y-1/2 hover:text-white"
									onClick={(e) => {
										e.stopPropagation();
										nextImage(e);
									}}
								>
									<ChevronRightIcon className="h-8 w-8" />
								</Button>

								{/* Image Counter/Dots in Modal */}
								<div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-40">
									{images.map((_, idx) => (
										<button
											key={idx}
											onClick={(e) => {
												e.stopPropagation();
												setCurrentImageIndex(idx);
											}}
											className={`h-2 w-2 rounded-full transition-all ${
												idx === currentImageIndex
													? "bg-white scale-125"
													: "bg-white/40 hover:bg-white/60"
											}`}
										/>
									))}
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</>
	);
}
