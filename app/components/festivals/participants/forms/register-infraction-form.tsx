import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import {
	fetchInfractionTypes,
	registerInfraction,
} from "@/app/lib/infractions/actions";
import { InfractionType } from "@/app/lib/infractions/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
	infractionType: z
		.string({
			required_error: "El tipo de infracción requerido",
		})
		.min(1, { message: "El tipo de infracción requerido" }),
});

type RegisterInfractionFormProps = {
	participantId: number;
	festivalId: number;
	onSuccess: () => void;
};

export default function RegisterInfractionForm({
	participantId,
	festivalId,
	onSuccess,
}: RegisterInfractionFormProps) {
	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			infractionType: "",
		},
	});
	const [infractions, setInfractions] = useState<InfractionType[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		fetchInfractionTypes().then((infractions) => {
			setInfractions(infractions);
			setLoading(false);
		});
	}, []);

	const infractionOptions = infractions.map((infraction) => ({
		value: infraction.id.toString(),
		label: infraction.label,
	}));

	const action = form.handleSubmit(async (data) => {
		const response = await registerInfraction({
			userId: participantId,
			typeId: Number(data.infractionType),
			festivalId,
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
			<form className="flex flex-col gap-4" onSubmit={action}>
				<SelectInput
					label="Tipo de infracción"
					formControl={form.control}
					name="infractionType"
					options={infractionOptions}
					disabled={loading}
				/>
				<SubmitButton
					loading={loading || form.formState.isLoading}
					disabled={
						loading ||
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
