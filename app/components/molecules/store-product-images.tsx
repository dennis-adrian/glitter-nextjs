"use client";

import { Button } from "@/app/components/ui/button";
import {
	Carousel,
	CarouselApi,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/app/components/ui/carousel";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { BaseProductImage } from "@/app/lib/products/definitions";
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
	images: BaseProductImage[];
	isHovered: boolean;
};
export default function StoreProductImages({
	productName,
	stock,
	images,
	isHovered,
}: StoreProductImagesProps) {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isZoomed, setIsZoomed] = useState(false);
	const [touchStart, setTouchStart] = useState<number | null>(null);
	const [currentTranslate, setCurrentTranslate] = useState(0);
	const [isDragging, setIsDragging] = useState(false);

	const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
	const [isPanning, setIsPanning] = useState(false);
	const hasDraggedRef = useRef(false);
	const isPanningRef = useRef(false); // Added ref for immediate state tracking
	const panPositionRef = useRef({ x: 0, y: 0 });
	const lastPointRef = useRef({ x: 0, y: 0 });

	const [api, setApi] = useState<CarouselApi>();
	const [currentImageIndex, setCurrentImageIndex] = useState(0);

	useEffect(() => {
		if (!api) {
			return;
		}
		setCurrentImageIndex(api.selectedScrollSnap());
		api.on("select", () => {
			setCurrentImageIndex(api.selectedScrollSnap());
		});
	}, [api]);

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
		panPositionRef.current = { x: 0, y: 0 }; // reset ref
	};

	const toggleZoom = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (hasDraggedRef.current) return;

		if (isZoomed) {
			setIsZoomed(false);
			setPanPosition({ x: 0, y: 0 });
			panPositionRef.current = { x: 0, y: 0 }; // reset ref
			isPanningRef.current = false;
		} else {
			setIsZoomed(true);
		}
	};

	const onModalPointerDown = (e: React.PointerEvent) => {
		if (e.button !== 0) return;
		if ((e.target as HTMLElement).closest("button")) return;

		hasDraggedRef.current = false;

		if (isZoomed) {
			e.preventDefault();
			setIsPanning(true);
			isPanningRef.current = true;

			lastPointRef.current = { x: e.clientX, y: e.clientY };

			e.currentTarget.setPointerCapture(e.pointerId);
		} else {
			setTouchStart(e.clientX);
			setIsDragging(true);
		}
	};

	const onModalPointerMove = (e: React.PointerEvent) => {
		if (isZoomed && isPanningRef.current) {
			e.preventDefault();

			const deltaX = e.clientX - lastPointRef.current.x;
			const deltaY = e.clientY - lastPointRef.current.y;

			// Update last point immediately
			lastPointRef.current = { x: e.clientX, y: e.clientY };

			// Check threshold for click vs drag distinction
			if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
				// Only mark as dragged if there is actual movement
				// We use a small accumulator for "hasDragged" check in the onClick if needed,
				// but usually any move is a drag.
				// Let's stick to the cumulative check or just use a small threshold
				// For now, just checking if we moved significantly overall?
				// We need to track total distance for that.
				// Let's simplify: if we are moving, we are dragging.
				hasDraggedRef.current = true;
			}

			// Apply delta to the accumulated position
			panPositionRef.current = {
				x: panPositionRef.current.x + deltaX,
				y: panPositionRef.current.y + deltaY,
			};

			// Force update state for render
			setPanPosition({ ...panPositionRef.current });
		} else if (!isZoomed && isDragging && touchStart !== null) {
			const currentTouch = e.clientX;
			const diff = touchStart - currentTouch;
			if (Math.abs(diff) > 5) hasDraggedRef.current = true;
			setCurrentTranslate(diff);
		}
	};

	const onModalPointerUp = (e: React.PointerEvent) => {
		if (isZoomed) {
			setIsPanning(false);
			isPanningRef.current = false; // Reset ref
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

	const mainImage = images.find((img) => img.isMain);
	const secondaryImages = images.filter((img) => !img.isMain);
	const imageUrls: string[] = [];

	if (!mainImage && secondaryImages.length === 0) {
		imageUrls.push(PLACEHOLDER_IMAGE_URLS["1200"]);
	} else if (!mainImage) {
		imageUrls.push(...secondaryImages.map((img) => img.imageUrl));
	} else {
		imageUrls.push(mainImage.imageUrl);
		imageUrls.push(...secondaryImages.map((img) => img.imageUrl));
	}

	return (
		<>
			<Carousel setApi={setApi}>
				<CarouselContent
					className="aspect-square"
					onClick={(e) => {
						// Prevent opening the modal if image is placeholder or out of stock
						if (stock > 0 && imageUrls?.[0] !== PLACEHOLDER_IMAGE_URLS["1200"])
							openModal(e);
					}}
				>
					{imageUrls.map((imgUrl, idx) => (
						<CarouselItem key={idx}>
							<div key={idx} className="min-w-full h-full relative">
								<Image
									src={imgUrl}
									alt={`${productName} - Image ${idx + 1}`}
									fill
									className="object-cover select-none"
								/>
							</div>
						</CarouselItem>
					))}
				</CarouselContent>
				{stock > 0 && imageUrls?.[0] !== PLACEHOLDER_IMAGE_URLS["1200"] && (
					<div className="absolute top-2 right-2">
						<div
							onClick={openModal}
							className="bg-black/50 text-white p-1.5 rounded-full backdrop-blur-sm hover:bg-black/70"
						>
							<Maximize2Icon className="h-4 w-4" />
						</div>
					</div>
				)}
				{imageUrls.length > 1 && (
					<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 py-1 px-2 rounded-full bg-black/30 backdrop-blur-[2px]">
						{imageUrls.map((_, idx) => (
							<div
								key={idx}
								className={`h-1.5 w-1.5 rounded-full transition-all shadow-sm ${
									idx === currentImageIndex
										? "bg-white scale-110"
										: "bg-white/50 hover:bg-white/75"
								}`}
								onClick={() => api?.scrollTo(idx)}
							/>
						))}
					</div>
				)}
				{currentImageIndex > 0 && imageUrls.length > 1 && (
					<CarouselPrevious
						variant="ghost"
						className="absolute left-2 top-1/2 -translate-y-1/2 hover:-translate-y-1/2 bg-black/50 hover:bg-black/70 text-white hover:text-white"
					/>
				)}
				{currentImageIndex < images.length - 1 && imageUrls.length > 1 && (
					<CarouselNext
						variant="ghost"
						className="absolute right-2 top-1/2 -translate-y-1/2 hover:-translate-y-1/2 bg-black/50 hover:bg-black/70 text-white hover:text-white"
					/>
				)}
			</Carousel>

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
						style={{ touchAction: "none" }} // Enforce touch-action none inline
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
								src={imageUrls[currentImageIndex] ?? ""}
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
						{imageUrls.length > 1 && !isZoomed && (
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
									{imageUrls.map((_, idx) => (
										<button
											key={idx}
											onClick={(e) => {
												e.stopPropagation();
												api?.scrollTo(idx);
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
