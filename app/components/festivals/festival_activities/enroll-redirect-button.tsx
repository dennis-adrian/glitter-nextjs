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
import {
	enrollFromWaitlistInvitation,
	enrollInActivity,
	joinActivityWaitlist,
	leaveActivityWaitlist,
} from "@/app/lib/festival_activites/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Form } from "@/app/components/ui/form";
import SubmitButton from "@/app/components/simple-submit-button";
import {
	getUserWaitlistEntry,
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
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { CheckCircle2Icon, InfoIcon } from "lucide-react";
import { formatDate } from "@/app/lib/formatters";

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
	const [justEnrolled, setJustEnrolled] = useState(false);
	const [newParticipationId, setNewParticipationId] = useState<number | null>(
		null,
	);
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

	const activityDetail =
		activity.details.find((d) => !isActivityDetailFull(d)) ??
		activity.details[0];

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
					const isCouponBook =
						activity.proofType === "text" || activity.proofType === "both";
					if (
						isCouponBook &&
						"participationId" in result &&
						result.participationId
					) {
						setJustEnrolled(true);
						setNewParticipationId(result.participationId);
					} else {
						router.push(
							`/profiles/${forProfile.id}/festivals/${festivalId}/activity/enroll/success`,
						);
					}
				} else {
					toast.error(result.message);
				}
			} catch (error) {
				toast.error("Error inesperado al procesar la inscripción");
			}
		});
	});

	const handleWaitlistEnrollment = async () => {
		startTransition(async () => {
			try {
				const result = await joinActivityWaitlist(forProfile, activity.id);
				if (result.success) {
					toast.success(result.message);
					router.refresh();
				} else {
					toast.error(result.message);
				}
			} catch (error) {
				toast.error("Error inesperado al unirse a la lista de espera");
			}
		});
	};

	const handleLeaveWaitlist = async () => {
		startTransition(async () => {
			try {
				const result = await leaveActivityWaitlist(forProfile.id, activity.id);
				if (result.success) {
					toast.success(result.message);
					router.refresh();
				} else {
					toast.error(result.message);
				}
			} catch (error) {
				toast.error("Error inesperado al salir de la lista de espera");
			}
		});
	};

	const handleAcceptWaitlistInvitation = async (waitlistEntryId: number) => {
		startTransition(async () => {
			try {
				const result = await enrollFromWaitlistInvitation(
					forProfile.id,
					waitlistEntryId,
					festivalId,
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
				toast.error(
					"Error inesperado al aceptar la invitación de la lista de espera",
				);
			}
		});
	};

	const allVariantsFull =
		activity.type !== "sticker_print" &&
		activity.details.every((d) => isActivityDetailFull(d));

	if (
		allVariantsFull &&
		!isProfileEnrolledInActivity(forProfile.id, activity)
	) {
		const waitlistEntry = getUserWaitlistEntry(forProfile.id, activity);
		const waitlistEnabled = !!activity.waitlistWindowMinutes;

		// Active invitation window
		if (
			waitlistEntry?.notifiedAt &&
			waitlistEntry.expiresAt &&
			new Date() < new Date(waitlistEntry.expiresAt) &&
			waitlistEntry.notifiedForDetailId
		) {
			const expiresAt = formatDate(waitlistEntry.expiresAt).toLocaleString(
				DateTime.DATETIME_MED,
			);

			return (
				<Alert>
					<InfoIcon className="w-4 h-4" />
					<AlertTitle>¡Tenés un cupo disponible!</AlertTitle>
					<AlertDescription className="w-full flex flex-col gap-2">
						<p>Inscribite antes del {expiresAt}.</p>
						<Button
							onClick={() => handleAcceptWaitlistInvitation(waitlistEntry.id)}
							disabled={isPending}
							className="w-full"
						>
							{isPending ? "Inscribiendo..." : "Inscribirme ahora"}
						</Button>
					</AlertDescription>
				</Alert>
			);
		}

		// Expired invitation — user can still try if a slot is available
		if (
			waitlistEntry?.notifiedAt &&
			waitlistEntry.notifiedForDetailId &&
			(!waitlistEntry.expiresAt ||
				new Date() >= new Date(waitlistEntry.expiresAt))
		) {
			return (
				<Alert>
					<InfoIcon className="w-4 h-4" />
					<AlertTitle>Tu invitación venció</AlertTitle>
					<AlertDescription className="w-full flex flex-col gap-2">
						<p>
							El tiempo para inscribirte expiró, pero podés intentarlo si
							todavía hay un cupo disponible.
						</p>
						<Button
							onClick={() => handleAcceptWaitlistInvitation(waitlistEntry.id)}
							disabled={isPending}
							className="w-full max-w-sm self-center"
						>
							{isPending ? "Verificando..." : "Intentar inscribirme"}
						</Button>
					</AlertDescription>
				</Alert>
			);
		}

		// On waitlist (waiting)
		if (waitlistEntry) {
			return (
				<Alert>
					<InfoIcon className="w-4 h-4" />
					<AlertTitle>Estás en la lista de espera</AlertTitle>
					<AlertDescription className="w-full flex flex-col gap-2">
						<p>
							Sos el número <strong>#{waitlistEntry.position}</strong> en la
							lista de espera. Cuando se libere un cupo, te notificaremos por
							correo electrónico.
						</p>
						<Button
							className="w-full max-w-sm self-center"
							variant="destructive"
							size="sm"
							disabled={isPending}
							onClick={handleLeaveWaitlist}
						>
							{isPending ? "Procesando..." : "Salir de la lista"}
						</Button>
					</AlertDescription>
				</Alert>
			);
		}

		// Not on waitlist — offer to join (if enabled)
		if (waitlistEnabled) {
			return (
				<Alert>
					<InfoIcon className="w-4 h-4" />
					<AlertTitle>Anotate en la lista de espera</AlertTitle>
					<AlertDescription className="w-full flex flex-col gap-2">
						<p>
							La actividad llegó al límite de inscripciones pero podés anotarte
							a la lista de espera y te llegará un correo cuando se libere un
							cupo.
						</p>
						<Button
							className="w-full max-w-sm self-center"
							disabled={isPending}
							onClick={handleWaitlistEnrollment}
						>
							{isPending ? "Procesando..." : "Unirme a la lista de espera"}
						</Button>
					</AlertDescription>
				</Alert>
			);
		}

		return (
			<div className="flex flex-col text-center border border-gray-200 rounded-md p-4 bg-gray-50 text-gray-800">
				<p className="text-sm">
					La actividad ya ha llegado al límite de inscripciones
				</p>
			</div>
		);
	}

	if (justEnrolled && newParticipationId) {
		return (
			<div className="flex flex-col gap-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
				<div className="flex items-center gap-2 text-emerald-800">
					<CheckCircle2Icon className="w-5 h-5" />
					<p className="text-sm font-medium">¡Inscripción exitosa!</p>
				</div>
				<p className="text-sm text-emerald-700">
					Completá los detalles de tu promoción para finalizar tu participación.
				</p>
				<CouponBookProofModal
					participationId={newParticipationId}
					proofDisplayState="pending_proof"
					defaultOpen
					onSuccess={() => router.push("/")}
				/>
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
						forProfileId={forProfile.id}
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
