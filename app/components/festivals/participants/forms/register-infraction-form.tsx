import ComboboxInput from "@/app/components/form/fields/combobox";
import SubmitButton from "@/app/components/simple-submit-button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
	Form,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { registerInfraction } from "@/app/lib/infractions/actions";
import { InfractionType } from "@/app/lib/infractions/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
	infractionType: z
		.string({
            error: (issue) => issue.input === undefined ? "El tipo de infracción requerido" : undefined
        })
		.min(1, {
            error: "El tipo de infracción requerido"
        }),
	userGaveNotice: z.boolean(),
});

type RegisterInfractionFormProps = {
	participantId: number;
	festivalId: number;
	infractionTypes: InfractionType[];
	onSuccess: () => void;
};

export default function RegisterInfractionForm({
	participantId,
	festivalId,
	infractionTypes,
	onSuccess,
}: RegisterInfractionFormProps) {
	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			userGaveNotice: false,
		},
	});

	const infractionOptions = infractionTypes.map((infraction) => ({
		value: infraction.id.toString(),
		label: infraction.label,
	}));

	const action = form.handleSubmit(async (data) => {
		const { infractionType, userGaveNotice } = data;
		const response = await registerInfraction({
			userId: participantId,
			typeId: Number(infractionType),
			festivalId,
			userGaveNotice,
		});

		if (response.success) {
			toast.success(response.message);
			onSuccess();
		} else {
			toast.error(response.message);
		}
	});

	return (
		<Form {...form}>
			<form className="flex flex-col gap-4 py-2" onSubmit={action}>
				<ComboboxInput
					form={form}
					name="infractionType"
					options={infractionOptions}
					label="Tipo de infracción"
					placeholder="Selecciona una opción"
				/>
				<FormField
					control={form.control}
					name="userGaveNotice"
					render={({ field }) => (
						<FormItem className="flex flex-col gap-2">
							<FormLabel>¿Infracción notificada?</FormLabel>
							<div className="flex items-center gap-2">
								<Checkbox
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
								<FormDescription>
									El usuario dio aviso de la infracción
								</FormDescription>
							</div>
							<FormMessage />
						</FormItem>
					)}
				/>
				<SubmitButton
					loading={form.formState.isLoading}
					disabled={
						!form.formState.isDirty ||
						form.formState.isLoading ||
						form.formState.isSubmitting ||
						form.formState.isSubmitSuccessful
					}
					label="Registrar infracción"
				/>
			</form>
		</Form>
	);
}
