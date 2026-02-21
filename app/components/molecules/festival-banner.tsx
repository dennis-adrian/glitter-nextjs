import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

type Props = {
	festival: FestivalWithDates;
};
export default function FestivalBanner({ festival }: Props) {
	const dateLabel =
		festival.festivalDates.length > 0
			? getFestivalDateLabel(festival, true)
			: null;

	return (
		<div
			className="relative w-full flex items-end overflow-hidden rounded-lg"
			style={{
				height: "clamp(200px, 35vh, 280px)",
				backgroundImage: festival.festivalBannerUrl
					? `url(${festival.festivalBannerUrl})`
					: undefined,
				backgroundSize: "cover",
				backgroundPosition: "center top",
				backgroundColor: festival.festivalBannerUrl
					? undefined
					: "hsl(262 77% 49%)",
			}}
		>
			{/* Gradient overlay */}
			<div className="absolute inset-0 bg-linear-to-t md:bg-linear-to-r from-black/90 via-black/40 to-black/20" />

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
					<Link href={`/festivals/${festival.id}`}>
						Ver festival <ArrowRightIcon className="size-4 ml-2" />
					</Link>
				</Button>
				<Button
					asChild
					size="lg"
					className="hidden w-40 sm:flex items-center justify-center bg-white text-foreground hover:bg-white/90 font-semibold shadow-lg"
				>
					<Link href={`/festivals/${festival.id}`}>
						Ver festival <ArrowRightIcon className="size-4 ml-2" />
					</Link>
				</Button>
			</div>
		</div>
	);
}
