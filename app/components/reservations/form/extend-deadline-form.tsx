"use client";

import { extendReservationPaymentDeadline } from "@/app/lib/reservations/admin-actions";
import SubmitButton from "@/app/components/simple-submit-button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { DateTime } from "luxon";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

function toLocalInputValue(date: Date): string {
	return DateTime.fromJSDate(date, { zone: "local" }).toFormat(
		"yyyy-LL-dd'T'HH:mm",
	);
}

function buildSchema(currentDueDate: Date | null, openedAt: number) {
	return z.object({
		newDueDate: z
			.string()
			.min(1, "Requerido")
			.refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida")
			.refine(
				(v) => new Date(v).getTime() > openedAt,
				"Debe ser una fecha futura",
			)
			.refine(
				(v) =>
					currentDueDate == null ||
					new Date(v).getTime() > currentDueDate.getTime(),
				"Debe ser posterior a la fecha límite actual",
			),
	});
}

export function ExtendDeadlineForm({
	reservationId,
	currentDueDate,
	onSuccess,
}: {
	reservationId: number;
	currentDueDate: Date | null;
	onSuccess: () => void;
}) {
	const [openedAt] = useState(() => Date.now());
	const FormSchema = buildSchema(currentDueDate, openedAt);
	const defaultDate = currentDueDate
		? new Date(currentDueDate.getTime() + 24 * 60 * 60 * 1000)
		: new Date(openedAt + 24 * 60 * 60 * 1000);
	const minValue = toLocalInputValue(new Date(openedAt + 60 * 1000));

	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			newDueDate: toLocalInputValue(defaultDate),
		},
	});

	const action: () => void = form.handleSubmit(async (data) => {
		const res = await extendReservationPaymentDeadline({
			reservationId,
			newDueDate: new Date(data.newDueDate),
		});
		if (res.success) {
			toast.success(res.message);
			onSuccess();
		} else {
			toast.error(res.message);
		}
	});

	return (
		<Form {...form}>
			<form className="flex flex-col gap-4 w-full" onSubmit={action}>
				<FormField
					control={form.control}
					name="newDueDate"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Nueva fecha límite de pago</FormLabel>
							<FormControl>
								<Input type="datetime-local" min={minValue} {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<SubmitButton
					className="flex w-full"
					loading={form.formState.isSubmitting}
					disabled={form.formState.isSubmitting}
				>
					Extender plazo
				</SubmitButton>
			</form>
		</Form>
	);
}
