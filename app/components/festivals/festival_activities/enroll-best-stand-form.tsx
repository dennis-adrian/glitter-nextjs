"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
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
import { enrollInBestStandActivity } from "@/app/lib/festival_sectors/actions";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { DateTime } from "luxon";
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
};

export default function EnrollBestStandForm({
	forProfile,
	activity,
}: EnrollBestStandFormProps) {
	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			consent: false,
		},
	});
	const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);

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
		console.log(result);

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
