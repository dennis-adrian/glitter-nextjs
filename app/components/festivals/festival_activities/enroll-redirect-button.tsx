"use client";

import { RedirectButton } from "@/app/components/redirect-button";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { useEffect, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { DateTime } from "luxon";
import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import { useForm } from "react-hook-form";
import { enrollInActivity } from "@/app/lib/festival_sectors/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import SubmitButton from "@/app/components/simple-submit-button";
import {
	isActivityDetailFull,
	isProfileEnrolledInActivity,
} from "@/app/lib/festival_sectors/helpers";
import UploadStickerDesignModal from "@/app/components/festivals/festival_activities/upload-sticker-design-modal";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { Checkbox } from "@/app/components/ui/checkbox";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/app/components/ui/button";
import { getCategoryLabel } from "@/app/lib/maps/helpers";

const FormSchema = z.object({
	consent: z.boolean().refine((val) => val === true, {
		message: "Confirma que leíste y aceptaste las condiciones de la actividad.",
	}),
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
	const router = useRouter();
	const form = useForm<z.infer<typeof FormSchema>>({
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

	const action = form.handleSubmit(async () => {
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

		const hasUploadedProof = (userParticipation?.proofs?.length ?? 0) > 0;

		if (!hasUploadedProof && userParticipation) {
			return (
				<div className="flex gap-2 text-sm flex-col text-center border border-emerald-200 rounded-md p-4 bg-emerald-50 text-emerald-800">
					<p>
						Ya estás inscrito en esta actividad. No te olvides de subir el
						diseño de tu sello.
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
				<p className="text-sm">
					Ya estás inscrito en esta actividad. Y subiste el diseño de tu sello
					correctamente.
				</p>
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
								{activity.type !== "sticker_print" ? (
									<Form {...form}>
										<form
											className="w-full flex flex-col gap-2"
											onSubmit={action}
										>
											<FormField
												control={form.control}
												name="consent"
												render={({ field }) => (
													<div className="flex flex-col gap-2">
														<FormItem className=" bg-amber-50 border border-amber-200 rounded-md p-3 text-amber-800">
															<div className="flex flex-row items-start gap-1">
																<FormControl>
																	<Checkbox
																		checked={field.value}
																		onCheckedChange={field.onChange}
																	/>
																</FormControl>
																<div className="space-y-1 leading-none">
																	<FormLabel className="text-current">
																		Confirmo que he leído y acepto las
																		condiciones de la actividad.
																	</FormLabel>
																	<FormDescription className="text-current">
																		Incumplir las condiciones de la actividad,
																		podría excluirte de futuros eventos y/o
																		actividades.
																	</FormDescription>
																</div>
															</div>
														</FormItem>
														<FormMessage />
													</div>
												)}
											/>
											<SubmitButton
												disabled={
													(!isEnabled && currentProfile.role !== "admin") ||
													form.formState.isSubmitting ||
													form.formState.isSubmitSuccessful
												}
												loading={form.formState.isSubmitting}
												loadingLabel="Inscribiendo..."
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
