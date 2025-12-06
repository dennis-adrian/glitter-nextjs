"use client";

import {
	BaseProfile,
	ParticipationWithParticipantWithInfractionsAndReservations,
} from "@/app/api/users/definitions";
import UploadStickerDesignModal from "@/app/components/festivals/festival_activities/upload-sticker-design-modal";
import SubmitButton from "@/app/components/simple-submit-button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import {
	deleteFestivalActivityParticipantProof,
	enrollInBestStandActivity,
} from "@/app/lib/festival_sectors/actions";
import {
	ActivityDetailsWithParticipants,
	FestivalActivityWithDetailsAndParticipants,
} from "@/app/lib/festivals/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertCircleIcon,
	CircleAlertIcon,
	Loader2Icon,
	Trash2Icon,
} from "lucide-react";
import { DateTime } from "luxon";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
	consent: z.boolean().refine((val) => val === true, {
		message: "Confirma que leíste y aceptaste las condiciones de la actividad.",
	}),
});

type EnrollBestStandFormProps = {
	forProfile: BaseProfile;
	activity: FestivalActivityWithDetailsAndParticipants;
	festivalParticipants: ParticipationWithParticipantWithInfractionsAndReservations[];
	activityVariantForProfile?: ActivityDetailsWithParticipants;
};

export default function EnrollBestStandForm({
	forProfile,
	activity,
	festivalParticipants,
	activityVariantForProfile,
}: EnrollBestStandFormProps) {
	const router = useRouter();
	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			consent: false,
		},
	});
	const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
	const [deletingProofId, setDeletingProofId] = useState<number | null>(null);
	const [confirmDeleteProofId, setConfirmDeleteProofId] = useState<
		number | null
	>(null);

	const [statusMessage, setStatusMessage] = useState("");

	useEffect(() => {
		// Function to check if current date is within registration period
		const checkRegistrationPeriod = () => {
			const now = DateTime.now();
			// Convert Date objects to Luxon DateTime objects
			const startDate = DateTime.fromJSDate(activity.registrationStartDate);
			const endDate = DateTime.fromJSDate(activity.registrationEndDate);

			if (now < startDate) {
				setIsRegistrationOpen(false);
				setStatusMessage(
					`El registro comenzará el ${startDate.toLocaleString({
						month: "long",
						day: "numeric",
					})} a las ${startDate.toLocaleString({
						hour: "numeric",
						minute: "numeric",
					})}`,
				);
			} else if (now > endDate) {
				setIsRegistrationOpen(false);
				setStatusMessage(
					`El registro finalizó el ${endDate.toLocaleString({
						month: "long",
						day: "numeric",
					})} a las ${endDate.toLocaleString({
						hour: "numeric",
						minute: "numeric",
					})}`,
				);
			} else {
				setIsRegistrationOpen(true);
				setStatusMessage(
					`Registro abierto hasta el ${endDate.toLocaleString({
						month: "long",
						day: "numeric",
					})} a las ${endDate.toLocaleString({
						hour: "numeric",
						minute: "numeric",
					})}`,
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

	const action: () => void = form.handleSubmit(async (data) => {
		const result = await enrollInBestStandActivity(
			activity.id,
			forProfile.id,
			activity.festivalId,
			forProfile.category,
		);

		if (result.success) {
			toast.success(result.message);
		} else {
			toast.error(result.message);
		}
	});

	const buttonLabel = isRegistrationOpen
		? "Quiero participar en la actividad"
		: "Registro no disponible";

	if (!isRegistrationOpen) {
		return (
			<div className="w-full flex flex-col gap-2">
				<Button className="w-full" disabled>
					Registro no disponible
				</Button>
				<p className="text-sm text-muted-foreground italic">{statusMessage}</p>
			</div>
		);
	}

	if (!activityVariantForProfile) {
		return (
			<div className="w-full flex gap-2 bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-800">
				<AlertCircleIcon className="w-6 h-6" />
				<p className="text-sm">Actividad no disponible para tu categoría</p>
			</div>
		);
	}

	/**
	 * Check if the stand is already enrolled by another participant
	 */
	const forProfileStand = festivalParticipants.find(
		(participant) => participant.user.id === forProfile.id,
	)?.reservation?.stand;

	const otherParticipantIdsInSameStand = festivalParticipants
		.filter(
			(participant) =>
				participant.reservation?.standId === forProfileStand?.id &&
				participant.user.id !== forProfile.id,
		)
		?.map((participant) => participant.user.id);

	let isStandAlreadyEnrolled = false;
	// Check if the other participant with the same stand is already enrolled in the activity
	for (const participant of activityVariantForProfile?.participants || []) {
		if (otherParticipantIdsInSameStand?.includes(participant.userId)) {
			isStandAlreadyEnrolled = true;
			break;
		}
	}

	if (isStandAlreadyEnrolled) {
		return (
			<div className="w-full flex gap-2 bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-800">
				<CircleAlertIcon className="w-6 h-6" />
				<p className="text-sm">
					El espacio{" "}
					{forProfileStand && (
						<span>
							<strong>
								{forProfileStand?.label}
								{forProfileStand?.standNumber}
							</strong>{" "}
						</span>
					)}
					ya está inscrito a la actividad por otro participante
				</p>
			</div>
		);
	}

	/**
	 * Check if the profile is already enrolled in the activity
	 */
	if (
		activityVariantForProfile.participants.some(
			(participant) => participant.user.id === forProfile.id,
		)
	) {
		const userParticipation = activityVariantForProfile.participants.find(
			(participant) => participant.user.id === forProfile.id,
		);

		if (userParticipation?.proofs.length === 0) {
			return (
				<div className="flex gap-2 text-sm flex-col text-center border border-amber-200 rounded-md p-4 bg-amber-50 text-amber-800">
					<p>
						Ya estás inscrito en esta actividad. No te olvides de subir la
						imagen de tu stand.
					</p>
					<UploadStickerDesignModal
						participationId={userParticipation.id}
						maxFiles={1}
					/>
				</div>
			);
		}

		// Show uploaded images with delete option
		if (userParticipation?.proofs && userParticipation.proofs.length > 0) {
			return (
				<div className="flex gap-3 text-sm flex-col border border-amber-200 rounded-md p-4 bg-amber-50 text-amber-800">
					<p className="text-center">
						Ya estás inscrito en esta actividad. Tus imágenes subidas:
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{userParticipation.proofs.map((proof) => (
							<div
								key={proof.id}
								className="flex flex-col gap-2 border border-amber-300 rounded-md p-2 bg-white"
							>
								<div className="relative w-full aspect-square rounded-md overflow-hidden">
									<Image
										src={proof.imageUrl}
										alt={`Imagen de stand ${proof.id}`}
										fill
										className="object-contain"
									/>
								</div>
								<Button
									variant="outline"
									size="sm"
									className="w-full bg-red-50 hover:bg-red-100 text-red-800 border-red-300"
									onClick={() => setConfirmDeleteProofId(proof.id)}
									disabled={deletingProofId === proof.id}
								>
									{deletingProofId === proof.id ? (
										<>
											<Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
											<span>Eliminando...</span>
										</>
									) : (
										<>
											<Trash2Icon className="w-4 h-4 mr-2" />
											<span>Eliminar</span>
										</>
									)}
								</Button>
							</div>
						))}
					</div>
					<AlertDialog
						open={confirmDeleteProofId !== null}
						onOpenChange={(open) => {
							if (!open) {
								setConfirmDeleteProofId(null);
							}
						}}
					>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
								<AlertDialogDescription>
									Esta acción no se puede deshacer. La imagen será eliminada
									permanentemente.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel
									disabled={deletingProofId !== null}
									onClick={() => setConfirmDeleteProofId(null)}
								>
									Cancelar
								</AlertDialogCancel>
								<AlertDialogAction
									onClick={async () => {
										if (confirmDeleteProofId === null) return;
										setDeletingProofId(confirmDeleteProofId);
										const result =
											await deleteFestivalActivityParticipantProof(
												confirmDeleteProofId,
											);
										setDeletingProofId(null);
										setConfirmDeleteProofId(null);
										if (result.success) {
											toast.success(result.message);
											router.refresh();
										} else {
											toast.error(result.message);
										}
									}}
									disabled={deletingProofId !== null}
									className="bg-red-600 hover:bg-red-700"
								>
									{deletingProofId !== null ? "Eliminando..." : "Eliminar"}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			);
		}

		return (
			<Button className="w-full" disabled>
				Ya estás inscrito en esta actividad
			</Button>
		);
	}

	return (
		<Form {...form}>
			<form className="w-full flex flex-col gap-2" onSubmit={action}>
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
											Confirmo que he leído y acepto las condiciones de la
											actividad.
										</FormLabel>
										<FormDescription className="text-current">
											Incumplir las condiciones de la actividad, podría
											excluirte de futuros eventos y/o actividades.
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
						!isRegistrationOpen ||
						form.formState.isSubmitting ||
						form.formState.isSubmitSuccessful
					}
					loading={form.formState.isSubmitting}
					loadingLabel="Registrando participación"
					label={buttonLabel}
					className="font-normal"
				/>
			</form>
		</Form>
	);
}
