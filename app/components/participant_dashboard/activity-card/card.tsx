"use client";

import Link from "next/link";

import { ChevronRight, Clock } from "lucide-react";

import { BaseProfile } from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import ActivityTypeBadge from "@/app/components/participant_dashboard/activity-card/activity-type-badge";
import EnrolledBadge from "@/app/components/participant_dashboard/activity-card/enrolled-badge";
import EnrolledUsersCta from "@/app/components/participant_dashboard/activity-card/enrolled-users-cta";
import PendingActionNotice from "@/app/components/participant_dashboard/activity-card/pending-action-notice";
import RegistrationDeadlineStamp from "@/app/components/participant_dashboard/activity-card/registration-deadline-stamp";
import {
	getActivityTheme,
	getEnrolledConfig,
	getEnrollmentInfo,
} from "@/app/components/participant_dashboard/activity-card/utils";
import { Button } from "@/app/components/ui/button";
import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";

interface FestivalActivityCardProps {
	activity: FestivalActivityWithDetailsAndParticipants;
	forProfile: BaseProfile;
	index: number;
}

export default function FestivalActivityCard({
	activity,
	forProfile,
	index,
}: FestivalActivityCardProps) {
	const theme = getActivityTheme(index);
	const enrollment = getEnrollmentInfo(activity, forProfile.id);
	const enrolledConfig = enrollment.isEnrolled
		? getEnrolledConfig(activity, forProfile.id, enrollment.hasUploadedProof)
		: null;

	return (
		<div
			key={activity.id}
			className="relative transition-transform duration-300 ease-out"
			style={{ transformOrigin: "center center" }}
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
					<div className="flex items-start justify-between">
						<ActivityTypeBadge theme={theme} activityType={activity.type} />
						{enrollment.isEnrolled && <EnrolledBadge theme={theme} />}
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

					{enrollment.isEnrolled && enrolledConfig ? (
						<>
							{enrolledConfig.isPending && (
								<PendingActionNotice enrolledConfig={enrolledConfig} />
							)}

							{/* Deadline stamp for voting activities */}
							{enrolledConfig.ctaType === "link" &&
								enrolledConfig.deadlineDate && (
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
													enrolledConfig.deadlineDate,
												).toLocaleDateString("es-ES", {
													day: "numeric",
													month: "short",
													year: "numeric",
												})}
											</p>
										</div>
									</div>
								)}

							<EnrolledUsersCta
								enrolledConfig={enrolledConfig}
								participationId={enrollment.participationId}
								festivalId={activity.festivalId}
								activityId={activity.id}
								forProfile={forProfile}
								theme={theme}
							/>
						</>
					) : (
						<>
							{/* Registration deadline stamp */}
							{activity.registrationEndDate && (
								<RegistrationDeadlineStamp theme={theme} activity={activity} />
							)}

							{/* CTA for unenrolled users */}
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
						</>
					)}
				</div>
			</div>
		</div>
	);
}
