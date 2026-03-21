import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { deleteReservationCollaborator } from "@/app/lib/reservations/actions";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type RemoveCollaboratorFormProps = {
	reservationId: number;
	collaboratorId: number;
};

export default function RemoveCollaboratorForm({
	reservationId,
	collaboratorId,
}: RemoveCollaboratorFormProps) {
	const form = useForm();

	const action = form.handleSubmit(async (data) => {
		const result = await deleteReservationCollaborator(
			reservationId,
			collaboratorId,
		);
		if (result.success) {
			toast.success(result.message);
		} else {
			toast.error(result.message);
		}
	});

	return (
		<Form {...form}>
			<form onSubmit={action}>
				<SubmitButton
					variant="ghost"
					size="sm"
					className="text-gray-500 hover:text-rose-500 hover:bg-rose-500/10"
					disabled={form.formState.isSubmitting}
					loading={form.formState.isSubmitting}
				>
					<Trash2Icon className="h-4 w-4" />
				</SubmitButton>
			</form>
		</Form>
	);
}
