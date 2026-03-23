"use client";

import Image from "next/image";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselPrevious,
	CarouselNext,
} from "@/app/components/ui/carousel";

type VariantImage = {
	id: number;
	imageUrl: string | null;
	description: string | null;
};

export default function VariantImagesDisplay({
	details,
}: {
	details: VariantImage[];
}) {
	const variants = details.filter((d) => d.imageUrl);
	if (variants.length === 0) return null;

	return (
		<div className="w-full my-2">
			{/* Mobile / tablet: peek carousel — hidden on md+ */}
			<div className="md:hidden">
				<Carousel opts={{ align: "center", loop: false }}>
					<CarouselContent className="-ml-3">
						{variants.map((variant) => (
							<CarouselItem key={variant.id} className="pl-3 basis-[85%]">
								<div
									className="relative w-full rounded-lg overflow-hidden border"
									style={{ aspectRatio: "250 / 191" }}
								>
									<Image
										src={variant.imageUrl!}
										alt={variant.description ?? "Versión de cuponera"}
										fill
										className="object-cover"
										placeholder="blur"
										blurDataURL="/img/placeholders/placeholder-300x300.png"
									/>
								</div>
								{variant.description && (
									<p className="text-xs text-muted-foreground text-center mt-1">
										{variant.description}
									</p>
								)}
							</CarouselItem>
						))}
					</CarouselContent>
					{variants.length > 1 && (
						<>
							<CarouselPrevious className="left-0" />
							<CarouselNext className="right-0" />
						</>
					)}
				</Carousel>
			</div>

			{/* Desktop: grid — hidden below md */}
			<div
				className={`hidden md:grid gap-4 ${variants.length === 1 ? "grid-cols-1 max-w-sm mx-auto" : "grid-cols-2"}`}
			>
				{variants.map((variant) => (
					<div key={variant.id} className="flex flex-col gap-1">
						<div
							className="relative w-full rounded-lg overflow-hidden border"
							style={{ aspectRatio: "250 / 191" }}
						>
							<Image
								src={variant.imageUrl!}
								alt={variant.description ?? "Versión de cuponera"}
								fill
								className="object-cover"
								placeholder="blur"
								blurDataURL="/img/placeholders/placeholder-300x300.png"
							/>
						</div>

						{variant.description && (
							<p className="text-xs text-muted-foreground text-center">
								{variant.description}
							</p>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
