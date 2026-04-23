"use client";

import Autoplay from "embla-carousel-autoplay";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
} from "@/app/components/ui/carousel";
import { Participation, ProfileType } from "@/app/api/users/definitions";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { ArrowRightIcon } from "lucide-react";
import { UserRequestBase } from "@/app/api/user_requests/definitions";

type Props = {
	festivals: FestivalWithDates[];
	profile: ProfileType;
	activeParticipation: Participation | null | undefined;
	enrollment: UserRequestBase | null | undefined;
};

function getCtaProps(
	festival: FestivalWithDates,
	profileId: number,
	activeParticipation: Participation | null | undefined,
	enrollment: UserRequestBase | null | undefined,
) {
	const isActiveFestival = festival.status === "active";
	const participation =
		isActiveFestival &&
		activeParticipation?.reservation?.festival?.id === festival.id
			? activeParticipation
			: null;

	const enrollmentForFestival =
		enrollment?.festivalId === festival.id ? enrollment : null;

	if (!enrollmentForFestival) {
		return {
			text: "Participar",
			href: `/profiles/${profileId}/festivals/${festival.id}/terms`,
		};
	}

	if (!participation) {
		return {
			text: "Hacer mi reserva",
			href: `/profiles/${profileId}/festivals/${festival.id}/reservations/new`,
		};
	}

	return { text: "Ver festival", href: `/festivals/${festival.id}` };
}

export default function FestivalCarousel({
	festivals,
	profile,
	activeParticipation,
	enrollment,
}: Props) {
	const plugin = useRef(
		Autoplay({ delay: 5500, stopOnInteraction: true, stopOnMouseEnter: true }),
	);

	if (festivals.length === 0) return null;

	return (
		<Carousel
			plugins={[plugin.current]}
			opts={{ loop: festivals.length > 1 }}
			className="w-full"
		>
			<CarouselContent className="ml-0">
				{festivals.map((festival, slideIndex) => {
					const cta = getCtaProps(
						festival,
						profile.id,
						activeParticipation,
						enrollment,
					);
					const dateLabel =
						festival.festivalDates.length > 0
							? getFestivalDateLabel(festival, true)
							: null;
					const bannerUrl = festival.festivalBannerUrl;

					return (
						<CarouselItem key={festival.id} className="pl-0">
							<div className="relative flex min-h-0 w-full items-end overflow-hidden rounded-lg bg-[hsl(262_77%_49%)] aspect-3/2 max-h-[240px] md:max-h-[280px] md:aspect-3/1 lg:aspect-4/1">
								{bannerUrl ? (
									<Image
										src={bannerUrl}
										alt={festival.name}
										fill
										priority={slideIndex === 0}
										sizes="(max-width: 768px) 100vw, (max-width: 1280px) 100vw, 1280px"
										className="z-0 object-cover object-top"
									/>
								) : null}
								{/* Gradient overlay */}
								<div
									aria-hidden
									className="absolute inset-0 z-1 bg-linear-to-t md:bg-linear-to-r from-black/90 via-black/40 to-black/20"
								/>

								{/* Slide content */}
								<div className="relative z-10 w-full max-w-2xl px-4 md:px-10 pb-4 md:pb-14">
									{dateLabel && (
										<Badge className="mb-1 text-xs">
											<span>{dateLabel}</span>
										</Badge>
									)}
									<h1 className="text-3xl md:text-5xl font-bold text-white leading-[1.2] tracking-tight mb-2">
										{festival.name}
									</h1>
									<Button
										asChild
										className="sm:hidden bg-white text-foreground hover:bg-white/90 font-semibold shadow-lg"
									>
										<Link href={cta.href}>
											{cta.text} <ArrowRightIcon className="size-4 ml-2" />
										</Link>
									</Button>
									<Button
										asChild
										size="lg"
										className="hidden w-40 sm:flex items-center justify-center bg-white text-foreground hover:bg-white/90 font-semibold shadow-lg"
									>
										<Link href={cta.href}>
											{cta.text} <ArrowRightIcon className="size-4 ml-2" />
										</Link>
									</Button>
								</div>
							</div>
						</CarouselItem>
					);
				})}
			</CarouselContent>
		</Carousel>
	);
}
