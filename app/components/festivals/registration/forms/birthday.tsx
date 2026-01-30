"use client";

import {
	getDaysOptions,
	getMonthsOptions,
	getYearsOptions,
} from "@/app/components/festivals/registration/forms/helpers";
import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const FormSchema = z
	.object({
		day: z
			.string({
				error: (issue) =>
					issue.input === undefined ? "El día es requerido" : undefined,
			})
			.transform((val) => Number(val))
			.pipe(
				z.number().min(1, {
					error: "El día no es válido",
				}),
			),
		month: z
			.string({
				error: (issue) =>
					issue.input === undefined ? "El mes es requerido" : undefined,
			})
			.transform((val) => Number(val))
			.pipe(
				z.number().min(1, {
					error: "El mes no es válido",
				}),
			),
		year: z
			.string({
				error: (issue) =>
					issue.input === undefined ? "El año es requerido" : undefined,
			})
			.transform((val) => Number(val))
			.pipe(
				z.number().min(1920, {
					error: "El año no es válido",
				}),
			),
	})
	.superRefine((data, ctx) => {
		const date = DateTime.fromObject(data);
		if (!date.isValid) {
			ctx.addIssue({
				code: "custom",
				message: "La fecha no es válida",
				path: ["year"],
			});

			return;
		}

		if (DateTime.now().diff(date, "years").years < 10) {
			ctx.addIssue({
				code: "custom",
				message: "Un menor de 10 años no puede registrarse",
				path: ["year"],
			});
		}
	});

type BirthdayFormProps = {
	onSubmit: (birthdate: Date) => void;
};

export default function BirthdayForm(props: BirthdayFormProps) {
	const form = useForm<
		z.input<typeof FormSchema>,
		unknown,
		z.output<typeof FormSchema>
	>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			day: new Date().getDate().toString(),
			month: (new Date().getMonth() + 1).toString(),
			year: DateTime.now().minus({ years: 10 }).year.toString(),
		},
	});

	const [year, month] = useWatch({
		control: form.control,
		name: ["year", "month"],
	});

	const action: () => void = form.handleSubmit(async (data) => {
		const birthdate = new Date(data.year, data.month - 1, data.day);
		props.onSubmit(birthdate);
	});

	return (
		<Form {...form}>
			<form className="flex gap-6 flex-col" onSubmit={action}>
				<div className="flex items-end gap-1 sm:gap-4">
					<SelectInput
						className="w-full"
						variant="quiet"
						side="top"
						formControl={form.control}
						label="Año"
						name="year"
						placeholder="AAAA"
						options={getYearsOptions()}
					/>
					<span className="text-2xl text-muted-foreground">/</span>
					<SelectInput
						className="w-full"
						variant="quiet"
						side="top"
						formControl={form.control}
						label="Mes"
						name="month"
						placeholder="MM"
						options={getMonthsOptions()}
					/>
					<span className="text-2xl text-muted-foreground">/</span>
					<SelectInput
						className="w-full"
						variant="quiet"
						side="top"
						formControl={form.control}
						label="Día"
						name="day"
						placeholder="DD"
						options={getDaysOptions(Number(month), Number(year))}
					/>
				</div>
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
