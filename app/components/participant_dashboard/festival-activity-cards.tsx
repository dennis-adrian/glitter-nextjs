"use client";

import type { FestivalActivity } from "@/app/lib/festivals/definitions";
import {
	ChevronRight,
	Clock,
	Sparkles,
	Stamp,
	Sticker,
	Trophy,
} from "lucide-react";
import Heading from "../atoms/heading";
import { Button } from "../ui/button";
import Link from "next/link";
import { BaseProfile } from "@/app/api/users/definitions";

const ACTIVITY_ICONS: Record<FestivalActivity["type"], typeof Stamp> = {
	stamp_passport: Stamp,
	sticker_print: Sticker,
	best_stand: Trophy,
	festival_sticker: Sparkles,
};

const ACTIVITY_LABELS: Record<FestivalActivity["type"], string> = {
	stamp_passport: "Pasaporte",
	sticker_print: "Sticker Print",
	best_stand: "Stand Destacado",
	festival_sticker: "Sticker del Festival",
};

const PRIMARY = "hsl(var(--primary))";
const PRIMARY_FG = "hsl(var(--primary-foreground))";

function getActivityTheme(index: number) {
	if (index % 2 === 0) {
		return {
			bg: PRIMARY_FG,
			border: PRIMARY,
			accent: PRIMARY,
			accentText: PRIMARY_FG,
			textPrimary: PRIMARY,
			textSecondary: PRIMARY,
			buttonBg: PRIMARY,
			buttonText: PRIMARY_FG,
			isPrimary: false,
		};
	}

	return {
		bg: PRIMARY,
		border: PRIMARY_FG,
		accent: PRIMARY_FG,
		accentText: PRIMARY,
		textPrimary: PRIMARY_FG,
		textSecondary: PRIMARY_FG,
		buttonBg: PRIMARY_FG,
		buttonText: PRIMARY,
		isPrimary: true,
	};
}

interface FestivalActivityCardsProps {
	activities: FestivalActivity[];
	forProfile: BaseProfile;
}

export default function FestivalActivityCards({
	activities,
	forProfile,
}: FestivalActivityCardsProps) {
	if (activities.length === 0) return null;

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
			{activities.map((activity, index) => {
				const Icon = ACTIVITY_ICONS[activity.type];
				const theme = getActivityTheme(index);

				return (
					<div
						key={activity.id}
						className="relative transition-transform duration-300 ease-out"
						style={{
							transformOrigin: "center center",
						}}
					>
						<div
							className="relative overflow-hidden"
							style={{
								backgroundColor: theme.bg,
								border: theme.isPrimary ? "none" : `4px solid ${theme.border}`,
								clipPath:
									"polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
							}}
						>
							{/* Perforations on left edge */}
							<div className="absolute left-0 top-0 bottom-0 w-4 flex flex-col justify-around items-center py-6">
								{Array.from({ length: 10 }).map((_, i) => (
									<div
										key={i}
										className="w-2.5 h-2.5 rounded-full"
										style={{ backgroundColor: theme.border }}
									/>
								))}
							</div>

							<div className="p-6 pl-10 space-y-4">
								{/* Type badge */}
								<div className="flex items-start justify-between">
									<div
										className="inline-flex items-center gap-2 px-3 py-1.5"
										style={{
											backgroundColor: theme.accent,
											clipPath:
												"polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))",
										}}
									>
										<Icon
											className="w-4 h-4"
											style={{
												color: theme.accentText,
												strokeWidth: 2.5,
											}}
										/>
										<span
											className="text-xs font-bold uppercase tracking-widest"
											style={{ color: theme.accentText }}
										>
											{ACTIVITY_LABELS[activity.type]}
										</span>
									</div>
								</div>

								{/* Title */}
								<Heading
									level={3}
									className="leading-none"
									style={{ color: theme.textPrimary }}
								>
									{activity.name}
								</Heading>

								{/* Description */}
								{activity.description && (
									<p
										className="text-sm leading-relaxed"
										style={{
											color: theme.textPrimary,
											opacity: 0.9,
										}}
									>
										{activity.description}
									</p>
								)}

								{/* Registration deadline stamp */}
								{activity.registrationEndDate && (
									<div className="pt-2">
										<div
											className="inline-flex items-center gap-2 px-4 py-2 border-2"
											style={{
												borderColor: theme.textSecondary,
												transform: "rotate(-2deg)",
												borderStyle: "dashed",
											}}
										>
											<Clock
												className="w-3.5 h-3.5"
												style={{ color: theme.textSecondary }}
											/>
											<p
												className="text-xs font-bold uppercase tracking-wide"
												style={{ color: theme.textSecondary }}
											>
												Hasta:{" "}
												{new Date(
													activity.registrationEndDate,
												).toLocaleDateString("es-ES", {
													day: "numeric",
													month: "short",
													year: "numeric",
												})}
											</p>
										</div>
									</div>
								)}

								{/* CTA */}
								<div className="pt-2">
									<Button
										className="w-full font-bold border-0 hover:opacity-90 transition-opacity"
										style={{
											backgroundColor: theme.buttonBg,
											color: theme.buttonText,
											clipPath:
												"polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
										}}
										size="lg"
										asChild
									>
										<Link
											href={`/profiles/${forProfile.id}/festivals/${activity.festivalId}/activity/${activity.id}`}
										>
											Participar
											<ChevronRight className="w-5 h-5 ml-1" />
										</Link>
									</Button>
								</div>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
