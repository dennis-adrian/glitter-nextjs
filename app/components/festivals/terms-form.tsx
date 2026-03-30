"use client";
import posthog from "posthog-js";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createUserEnrollment } from "@/app/api/user_requests/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import ConsentFormField from "../molecules/consent-form-field";

const FormSchema = z.object({
	consent: z
		.boolean()
		.refine(
			(val) => val === true,
			"¡Si no leíste toda la información volvé y leela que es importante!",
		),
});

export default function TermsForm({
	profile,
	festival,
}: {
	profile: ProfileType;
	festival: FestivalBase;
}) {
	const router = useRouter();
	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			consent: false,
		},
	});

	async function onSubmit(data: z.infer<typeof FormSchema>) {
		if (data.consent) {
			const res = await createUserEnrollment({
				profileId: profile.id,
				profileCategory: profile.category,
				profileDisplayName: profile.displayName,
				festivalId: festival.id,
				festivalName: festival.name,
				festivalReservationsStartDate: festival.reservationsStartDate,
			});

			if (res.success) {
				posthog.identify(profile.clerkId, {
					display_name: profile.displayName,
					category: profile.category,
				});
				posthog.capture(POSTHOG_EVENTS.FESTIVAL_TERMS_ACCEPTED, {
					festival_id: festival.id,
					festival_name: festival.name,
					profile_id: profile.id,
					profile_category: profile.category,
					is_gastronomy_application: profile.category === "gastronomy",
				});
				if (profile.category === "gastronomy") {
					toast.success("Postulación enviada. Te avisaremos si es aprobada.");
					router.push(`/portal`);
				} else {
					toast.success(res.message);
					router.push(
						`/profiles/${profile.id}/festivals/${festival.id}/reservations/new`,
					);
				}
			} else {
				toast.error(res.message);
			}
		}
	}

	const submitButtonLabel =
		profile.category === "gastronomy"
			? "Postularme al festival"
			: "Inscribirme al festival";

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
				<ConsentFormField
					name="consent"
					label="Acepto los términos y condiciones para participar en el festival"
					description="Si llegaste hasta aquí y estas de acuerdo con todas las normas anteriores, acepta los términos y condiciones y dale clic al botón"
				/>
				<div className="flex flex-col sm:flex-row gap-4">
					<Button
						disabled={form.formState.isSubmitting}
						className="flex-1"
						type="submit"
					>
						{form.formState.isSubmitting ? (
							<>
								<Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
								Cargando
							</>
						) : (
							<span>{submitButtonLabel}</span>
						)}
					</Button>
					<Button variant="outline" className="flex-1" asChild>
						<Link href="/">No quiero participar del festival</Link>
					</Button>
				</div>
			</form>
		</Form>
	);
}
