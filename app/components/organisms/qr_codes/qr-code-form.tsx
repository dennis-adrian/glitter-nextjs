"use client";

import DateInput from "@/app/components/form/fields/date";
import FileInput from "@/app/components/form/fields/file";
import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { createQrCode, updateQrCode } from "@/app/lib/qr_codes/actions";
import {
	type QrCodeBase,
	qrCodeFormSchema,
} from "@/app/lib/qr_codes/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { DateTime } from "luxon";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

type Props = {
	qrCode?: QrCodeBase;
};

export default function QrCodeForm({ qrCode }: Props) {
	const router = useRouter();
	const isEditing = !!qrCode;
	const [isUploading, setIsUploading] = useState(false);

	const form = useForm<
		z.input<typeof qrCodeFormSchema>,
		unknown,
		z.output<typeof qrCodeFormSchema>
	>({
		resolver: zodResolver(qrCodeFormSchema),
		defaultValues: {
			qrCodeUrl: qrCode?.qrCodeUrl ?? "",
			amount: qrCode?.amount != null ? String(qrCode.amount) : "",
			expirationDate: qrCode?.expirationDate
				? new Date(qrCode.expirationDate)
				: undefined,
		},
	});

	const previewUrl = form.watch("qrCodeUrl");

	const action = form.handleSubmit(async (data) => {
		const payload = {
			qrCodeUrl: data.qrCodeUrl,
			amount: data.amount,
			expirationDate: data.expirationDate,
		};

		try {
			const res = isEditing
				? await updateQrCode(qrCode.id, payload)
				: await createQrCode(payload);

			if (res.success) {
				toast.success(res.message);
				if (
					"fileDeletionError" in res &&
					typeof res.fileDeletionError === "string"
				) {
					toast.warning(res.fileDeletionError);
				}
				router.push("/dashboard/qr_codes");
				router.refresh();
			} else {
				toast.error(res.message);
			}
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error
					? error.message
					: "No se pudo guardar el código QR.";
			toast.error(message);
		}
	});

	return (
		<Form {...form}>
			<form className="grid gap-4" onSubmit={action}>
				<div className="grid gap-2">
					<FileInput
						formControl={form.control}
						label="Imagen del código QR"
						name="qrCodeUrl"
						endpoint="qrCode"
						onUploading={setIsUploading}
						description="Imagen PNG o JPG hasta 4MB."
					/>
					{previewUrl && (
						<div className="relative mx-auto aspect-square w-40 overflow-hidden rounded-md border bg-white">
							<Image
								src={previewUrl}
								alt="Vista previa del código QR"
								fill
								sizes="160px"
								className="object-contain"
							/>
						</div>
					)}
				</div>
				<TextInput
					label="Monto (Bs)"
					name="amount"
					type="number"
					min="0"
					step="0.01"
					placeholder="0"
					required
				/>
				<div className="grid gap-2">
					<DateInput
						formControl={form.control}
						label="Fecha de vencimiento"
						name="expirationDate"
					/>
					<div className="flex flex-wrap gap-2">
						{(
							[
								{ label: "+1 mes", plus: { months: 1 } },
								{ label: "+3 meses", plus: { months: 3 } },
								{ label: "+1 año", plus: { years: 1 } },
							] as const
						).map(({ label, plus }) => (
							<Button
								key={label}
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									form.setValue(
										"expirationDate",
										DateTime.now().plus(plus).toJSDate(),
										{ shouldDirty: true, shouldValidate: true },
									)
								}
							>
								{label}
							</Button>
						))}
					</div>
				</div>
				<SubmitButton
					disabled={
						isUploading ||
						form.formState.isSubmitting ||
						!form.formState.isDirty
					}
					loading={form.formState.isSubmitting}
				>
					{isEditing ? "Guardar cambios" : "Crear código QR"}
				</SubmitButton>
			</form>
		</Form>
	);
}
