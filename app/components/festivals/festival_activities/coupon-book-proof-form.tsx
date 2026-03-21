"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertCircleIcon } from "lucide-react";

import { upsertActivityParticipantProof } from "@/app/lib/festival_activites/admin-actions";
import { Button } from "@/app/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import type { ProofDisplayState } from "@/app/lib/festival_activites/types";

const FormSchema = z.object({
	promoDescription: z
		.string()
		.trim()
		.min(1, "La promoción es requerida")
		.max(30, "Máximo 80 caracteres"),
	promoConditions: z
		.string()
		.trim()
		.max(300, "Máximo 300 caracteres")
		.optional(),
});

type CouponBookProofFormProps = {
	participationId: number;
	proofDisplayState: ProofDisplayState;
	adminFeedback?: string | null;
	existingPromoDescription?: string | null;
	existingPromoConditions?: string | null;
	onSuccess?: () => void;
};

export default function CouponBookProofForm({
	participationId,
	proofDisplayState,
	adminFeedback,
	existingPromoDescription,
	existingPromoConditions,
	onSuccess,
}: CouponBookProofFormProps) {
	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			promoDescription: existingPromoDescription ?? "",
			promoConditions: existingPromoConditions ?? "",
		},
	});

	const promoDescription = form.watch("promoDescription");
	const promoConditions = form.watch("promoConditions") ?? "";

	const onSubmit = form.handleSubmit(async (data) => {
		const result = await upsertActivityParticipantProof(participationId, {
			promoDescription: data.promoDescription,
			promoConditions: data.promoConditions || undefined,
		});

		if (result.success) {
			toast.success(result.message);
			onSuccess?.();
		} else {
			toast.error(result.message);
		}
	});

	if (proofDisplayState === "rejected_removed") return null;

	return (
		<div className="space-y-4">
			{proofDisplayState === "rejected_resubmit" && adminFeedback && (
				<div className="flex gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-orange-800 text-sm">
					<AlertCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
					<div>
						<p className="font-medium">Se solicitaron correcciones</p>
						<p className="mt-1">{adminFeedback}</p>
					</div>
				</div>
			)}

			<Form {...form}>
				<form onSubmit={onSubmit} className="space-y-4">
					<FormField
						control={form.control}
						name="promoDescription"
						render={({ field }) => (
							<FormItem>
								<div className="flex justify-between items-baseline">
									<FormLabel>Promoción</FormLabel>
									<span className="text-xs text-muted-foreground">
										{promoDescription.length}/30
									</span>
								</div>
								<FormControl>
									<Input
										maxLength={30}
										placeholder="Ej: 10% de descuento"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="promoConditions"
						render={({ field }) => (
							<FormItem>
								<div className="flex justify-between items-baseline">
									<FormLabel>Condiciones (opcional)</FormLabel>
									<span className="text-xs text-muted-foreground">
										{promoConditions.length}/80
									</span>
								</div>
								<FormControl>
									<Textarea
										className="resize-none"
										rows={3}
										maxLength={80}
										placeholder="Ej: Válido para productos seleccionados"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<Button
						type="submit"
						className="w-full"
						disabled={form.formState.isSubmitting}
					>
						{form.formState.isSubmitting
							? "Enviando..."
							: proofDisplayState === "rejected_resubmit"
								? "Editar y reenviar"
								: "Enviar promoción"}
					</Button>
				</form>
			</Form>
		</div>
	);
}
