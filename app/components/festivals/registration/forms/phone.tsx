import PhoneInput from "@/app/components/form/fields/phone";
import { phoneValidator } from "@/app/components/form/input-validators";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
	phoneNumber: phoneValidator(),
});

type PhoneFormProps = {
	onSubmit: (phoneNumber: string) => void;
};

export default function PhoneForm(props: PhoneFormProps) {
	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			phoneNumber: "",
		},
	});

	const action: () => void = form.handleSubmit(async (data) => {
		props.onSubmit(data.phoneNumber);
	});

	return (
		<Form {...form}>
			<form className="flex flex-col gap-4" onSubmit={action}>
				<PhoneInput
					bottomBorderOnly
					formControl={form.control}
					name="phoneNumber"
				/>
				<SubmitButton
					disabled={form.formState.isSubmitting}
					loading={form.formState.isSubmitting}
				>
					<span>Continuar</span>
					<ArrowRightIcon className="ml-2 w-4 h-4" />
				</SubmitButton>
			</form>
		</Form>
	);
}
