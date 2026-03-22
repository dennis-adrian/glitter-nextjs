"use client";

import { RedirectButton } from "@/app/components/redirect-button";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { useEffect, useState, useTransition } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { DateTime } from "luxon";
import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import { useForm } from "react-hook-form";
import { enrollInActivity } from "@/app/lib/festival_activites/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Form } from "@/app/components/ui/form";
import SubmitButton from "@/app/components/simple-submit-button";
import {
	isActivityDetailFull,
	isProfileEnrolledInActivity,
} from "@/app/lib/festival_sectors/helpers";
import UploadStickerDesignModal from "@/app/components/festivals/festival_activities/upload-sticker-design-modal";
import CouponBookProofModal from "@/app/components/festivals/festival_activities/coupon-book-proof-modal";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import type { ProofDisplayState } from "@/app/lib/festival_activites/types";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/app/components/ui/button";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import ConsentFormField from "@/app/components/molecules/consent-form-field";

const FormSchema = z.object({
	consent: z
		.boolean()
		.refine(
			(val) => val === true,
			"Confirma que leíste y aceptaste las condiciones de la actividad.",
		),
});

type EnrollRedirectButtonProps = {
	currentProfile: BaseProfile;
	forProfile: BaseProfile;
	festivalId: FestivalBase["id"];
	activity: FestivalActivityWithDetailsAndParticipants;
	acceptedUserCategories?: UserCategory[];
};

export default function EnrollRedirectButton({
	currentProfile,
	forProfile,
	festivalId,
	activity,
	acceptedUserCategories = [],
}: EnrollRedirectButtonProps) {
	const [isEnabled, setIsEnabled] = useState(false);
	const [statusMessage, setStatusMessage] = useState("");
	const [isPending, startTransition] = useTransition();
	const router = useRouter();
	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			consent: false,
		},
	});

	useEffect(() => {
		// Function to check if current date is within registration period
		const checkRegistrationPeriod = () => {
			const now = DateTime.now();
			// Convert Date objects to Luxon DateTime objects
			const startDate = DateTime.fromJSDate(activity.registrationStartDate);
			const endDate = DateTime.fromJSDate(activity.registrationEndDate);

			if (now < startDate) {
				setIsEnabled(false);
				setStatusMessage(
					`El registro comenzará en ${startDate.toLocaleString(
						DateTime.DATETIME_MED,
					)}`,
				);
			} else if (now > endDate) {
				setIsEnabled(false);
				setStatusMessage(
					`El registro finalizó en ${endDate.toLocaleString(
						DateTime.DATETIME_MED,
					)}`,
				);
			} else {
				setIsEnabled(true);
				setStatusMessage(
					`Registro abierto hasta ${endDate.toLocaleString(
						DateTime.DATETIME_MED,
					)}`,
				);
			}
		};

		// Check immediately
		checkRegistrationPeriod();

		// Set up interval to check every 5 seconds
		const intervalId = setInterval(checkRegistrationPeriod, 5000);

		// Clean up interval on component unmount
		return () => clearInterval(intervalId);
	}, [activity.registrationStartDate, activity.registrationEndDate]);

	if (!activity.details?.length) {
		return (
			<div className="flex flex-col text-center border border-gray-200 rounded-md p-4 bg-gray-50 text-muted-foreground">
				<p className="text-sm">Inscripción no disponible</p>
			</div>
		);
	}

	const activityDetail = activity.details[0];

	const action = form.handleSubmit(async (data) => {
		startTransition(async () => {
			try {
				const result = await enrollInActivity(
					forProfile,
					festivalId,
					activityDetail,
					activity,
					acceptedUserCategories,
				);
				if (result.success) {
					toast.success(result.message);
					router.push(
						`/profiles/${forProfile.id}/festivals/${festivalId}/activity/enroll/success`,
					);
				} else {
					toast.error(result.message);
				}
			} catch (error) {
				toast.error("Error inesperado al procesar la inscripción");
			}
		});
	});

	if (
		activity.type !== "sticker_print" &&
		isActivityDetailFull(activityDetail)
	) {
		return (
			<div className="flex flex-col text-center border border-gray-200 rounded-md p-4 bg-gray-50 text-gray-800">
				<p className="text-sm">
					La actividad ya ha llegado al límite de inscripciones
				</p>
			</div>
		);
	}

	if (isProfileEnrolledInActivity(forProfile.id, activity)) {
		const participants = activity.details.flatMap(
			(detail) => detail.participants,
		);

		const userParticipation = participants.find(
			(participant) => participant.user.id === forProfile.id,
		);

		const proof = userParticipation?.proofs?.[0] ?? null;

		const proofDisplayState: ProofDisplayState = !proof
			? "pending_proof"
			: proof.proofStatus;

		// Removed participant — show disabled state
		if (proofDisplayState === "rejected_removed") {
			return (
				<div className="flex flex-col gap-1 border border-red-200 rounded-md p-4 bg-red-50 text-red-800">
					<p className="text-sm font-medium">Fuiste removido de la actividad</p>
					{proof?.adminFeedback && (
						<p className="text-xs text-red-700">{proof.adminFeedback}</p>
					)}
				</div>
			);
		}

		// Under review
		if (proofDisplayState === "pending_review") {
			return (
				<div className="flex flex-col text-center border border-amber-200 rounded-md p-4 bg-amber-50 text-amber-800">
					<p className="text-sm">Tu información está en revisión</p>
				</div>
			);
		}

		// Approved
		if (proofDisplayState === "approved") {
			return (
				<div className="flex flex-col text-center border border-emerald-200 rounded-md p-4 bg-emerald-50 text-emerald-800">
					<p className="text-sm">Participación confirmada</p>
				</div>
			);
		}

		const proofType = activity.proofType;

		// No proof required
		if (!proofType) {
			return (
				<div className="flex flex-col text-center border border-emerald-200 rounded-md p-4 bg-emerald-50 text-emerald-800">
					<p className="text-sm">Ya estás inscrito en esta actividad</p>
				</div>
			);
		}

		// Pending proof or rejected_resubmit — show upload UI
		if (userParticipation) {
			if (proofType === "text" || proofType === "both") {
				return (
					<div className="flex gap-2 text-sm flex-col text-center border border-amber-200 rounded-md p-4 bg-amber-50 text-amber-800">
						<p>
							{proofDisplayState === "rejected_resubmit"
								? "Se solicitaron correcciones en los detalles de tu promoción"
								: "Ya estás inscrito. No te olvidés de cargar los detalles de tu promoción"}
						</p>
						<CouponBookProofModal
							participationId={userParticipation.id}
							proofDisplayState={proofDisplayState}
							adminFeedback={proof?.adminFeedback}
							existingPromoHighlight={proof?.promoHighlight}
							existingPromoDescription={proof?.promoDescription}
							existingPromoConditions={proof?.promoConditions}
							triggerLabel={
								proofDisplayState === "rejected_resubmit"
									? "Editar y reenviar"
									: "Cargar mi promoción"
							}
						/>
					</div>
				);
			}

			// image or both — image upload
			return (
				<div className="flex gap-2 text-sm flex-col text-center border border-amber-200 rounded-md p-4 bg-amber-50 text-amber-800">
					<p>
						Ya estás inscrito. No te olvides de subir el diseño de tu sello.
					</p>
					<UploadStickerDesignModal
						participationId={userParticipation.id}
						maxFiles={1}
					/>
				</div>
			);
		}

		return (
			<div className="flex flex-col text-center border border-emerald-200 rounded-md p-4 bg-emerald-50 text-emerald-800">
				<p className="text-sm">Ya estás inscrito en esta actividad</p>
			</div>
		);
	}

	if (
		acceptedUserCategories.length > 0 &&
		!acceptedUserCategories.includes(forProfile.category)
	) {
		return (
			<div className="flex flex-col gap-2">
				<Button disabled className="w-full">
					Inscribirme
				</Button>
				<p className="text-sm md:text-center text-muted-foreground">
					Esta actividad no está disponible para la categoría de{" "}
					{getCategoryLabel(forProfile.category).toLocaleLowerCase()}.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<div className="flex justify-end w-full">
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="w-full flex flex-col gap-1 justify-center items-center">
								{activity.type !== "sticker_print" &&
								(isEnabled || currentProfile.role === "admin") ? (
									<Form {...form}>
										<form
											className="w-full flex flex-col gap-2"
											onSubmit={action}
										>
											<ConsentFormField
												name="consent"
												label="Confirmo que leí y estoy de acuerdo con las condiciones de la actividad."
												description="Entiendo que incumplir las condiciones de la actividad, podría excluirme de futuros eventos o actividades."
											/>

											<SubmitButton
												disabled={isPending}
												submittingLabel="Inscribiendo"
												label="Inscribirme"
											/>
										</form>
									</Form>
								) : (
									<RedirectButton
										className="w-full self-end"
										href={`/profiles/${forProfile.id}/festivals/${festivalId}/activity/enroll`}
										disabled={!isEnabled && currentProfile.role !== "admin"}
									>
										{isEnabled || currentProfile.role === "admin"
											? "Inscribirme"
											: "Registro no disponible"}
									</RedirectButton>
								)}
								<span className="text-xs text-center text-muted-foreground lg:hidden">
									{statusMessage}
								</span>
							</div>
						</TooltipTrigger>
						<TooltipContent>
							<p>{statusMessage}</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
		</div>
	);
}
