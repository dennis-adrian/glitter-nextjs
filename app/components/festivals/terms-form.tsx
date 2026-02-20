"use client";
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

const FormSchema = z.object({
	consent: z.boolean().refine((val) => val === true, {
		error:
			"¡Si no leíste toda la información vuelve y léela que es importante!",
	}),
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
				toast.success(res.message);
				router.push(
					`/profiles/${profile.id}/festivals/${festival.id}/reservations/new`,
				);
			} else {
				toast.error(res.message);
			}
		}
	}

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
				<FormField
					control={form.control}
					name="consent"
					render={({ field }) => (
						<FormItem className="rounded-md border p-4">
							<div className="flex flex-row items-start space-x-3 space-y-0">
								<FormControl>
									<Checkbox
										checked={field.value}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<div className="space-y-1 leading-none">
									<FormLabel>
										Acepto lo términos y condiciones para participar en el
										festival.
									</FormLabel>
									<FormDescription>
										Si llegaste hasta aquí y estas de acuerdo con todas las
										normas anteriores, acepta los términos y condiciones y dale
										clic al botón.
									</FormDescription>
								</div>
							</div>
							<FormMessage />
						</FormItem>
					)}
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
						) : profile.category === "gastronomy" ? (
							<span>Postularme al festival</span>
						) : (
							<span>Inscribrirme al festival</span>
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
