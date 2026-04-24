"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { updateStand } from "@/app/api/stands/actions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import { Button } from "@/app/components/ui/button";
import {
	DrawerDialog,
	DrawerDialogClose,
	DrawerDialogContent,
	DrawerDialogFooter,
	DrawerDialogHeader,
	DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { Form } from "@/app/components/ui/form";
import { useMediaQuery } from "@/app/hooks/use-media-query";

import {
	CATEGORY_OPTIONS,
	STAND_STATUS_OPTIONS,
	StandCategory,
	StandStatus,
} from "@/app/components/maps/admin/stand-manage/shared";

const FormSchema = z.object({
	label: z.string().trim().min(1, "La etiqueta es requerida"),
	standNumber: z.coerce.number().int().min(1, "Debe ser mayor a 0"),
	status: z.enum([
		"available",
		"held",
		"reserved",
		"confirmed",
		"disabled",
	]) as z.ZodType<StandStatus>,
	price: z.coerce.number().min(0, "No puede ser negativo"),
	standCategory: z.enum([
		"none",
		"illustration",
		"gastronomy",
		"entrepreneurship",
		"new_artist",
	]) as z.ZodType<StandCategory>,
});

type FormInput = z.input<typeof FormSchema>;
type FormOutput = z.output<typeof FormSchema>;

type Props = {
	stand: StandWithReservationsWithParticipants | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved?: () => void;
};

export default function StandEditFormDialog({
	stand,
	open,
	onOpenChange,
	onSaved,
}: Props) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const form = useForm<FormInput, unknown, FormOutput>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			label: "",
			standNumber: "1",
			status: "available",
			price: "0",
			standCategory: "none",
		},
	});

	useEffect(() => {
		if (stand && open) {
			form.reset({
				label: stand.label ?? "",
				standNumber: String(stand.standNumber),
				status: stand.status as StandStatus,
				price: String(stand.price ?? 0),
				standCategory: stand.standCategory as StandCategory,
			});
		}
	}, [stand, open, form]);

	async function onSubmit(values: FormOutput) {
		if (!stand) return;
		const res = await updateStand({
			id: stand.id,
			label: values.label,
			standNumber: values.standNumber,
			status: values.status,
			price: values.price,
			standCategory: values.standCategory,
		});
		if (res.success) {
			toast.success(res.message);
			onOpenChange(false);
			onSaved?.();
		} else {
			toast.error(res.message);
		}
	}

	return (
		<DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={onOpenChange}>
			<DrawerDialogContent className="sm:max-w-md" isDesktop={isDesktop}>
				<DrawerDialogHeader isDesktop={isDesktop}>
					<DrawerDialogTitle isDesktop={isDesktop}>
						Editar espacio
					</DrawerDialogTitle>
				</DrawerDialogHeader>

				<div className={isDesktop ? "" : "px-4 pb-2"}>
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							className="grid gap-4 pt-2"
						>
							<TextInput label="Etiqueta" name="label" required />
							<div className="grid gap-4 sm:grid-cols-2">
								<TextInput
									label="Número"
									name="standNumber"
									type="number"
									inputMode="numeric"
									min={1}
								/>
								<TextInput
									label="Precio (Bs.)"
									name="price"
									type="number"
									inputMode="decimal"
									min={0}
									step={1}
								/>
							</div>
							<SelectInput
								formControl={form.control}
								label="Estado"
								name="status"
								options={STAND_STATUS_OPTIONS.map((o) => ({
									value: o.value,
									label: o.label,
								}))}
							/>
							<SelectInput
								formControl={form.control}
								label="Categoría"
								name="standCategory"
								options={CATEGORY_OPTIONS.map((o) => ({
									value: o.value,
									label: o.label,
								}))}
							/>

							<div className="flex justify-end gap-2 pt-2">
								{isDesktop && (
									<Button
										type="button"
										variant="outline"
										onClick={() => onOpenChange(false)}
									>
										Cancelar
									</Button>
								)}
								<Button type="submit" disabled={form.formState.isSubmitting}>
									{form.formState.isSubmitting ? "Guardando…" : "Guardar"}
								</Button>
							</div>
						</form>
					</Form>
				</div>

				{!isDesktop && (
					<DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
						<DrawerDialogClose isDesktop={isDesktop}>
							<Button variant="outline">Cancelar</Button>
						</DrawerDialogClose>
					</DrawerDialogFooter>
				)}
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
