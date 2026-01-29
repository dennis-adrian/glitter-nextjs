"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { TicketWithVisitor, updateTicket } from "@/app/data/tickets/actions";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const FormSchema = z.object({
	confirmTicket: z.boolean().prefault(false),
});

export default function ActionsCell({ ticket }: { ticket: TicketWithVisitor }) {
	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			confirmTicket: ticket.status === "checked_in",
		},
	});

	async function onSubmit(data: z.infer<typeof FormSchema>) {
		const status: TicketWithVisitor["status"] = data.confirmTicket
			? "checked_in"
			: "pending";

		const res = await updateTicket(ticket.id, status);
		if (res.success) {
			toast.success("Entrada actualizada correctamente");
		} else if (res.error) {
			toast.error(res.error);
		} else {
			toast.error("Error desconocido");
		}
	}

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="confirmTicket"
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<Switch
									type="submit"
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
						</FormItem>
					)}
				/>
			</form>
		</Form>
	);
}
