"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import CouponBookCardPreview from "@/app/components/festivals/festival_activities/coupon-book-card-preview";
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
import { fetchParticipationPreviewData } from "@/app/lib/festival_activites/actions";
import { upsertActivityParticipantProof } from "@/app/lib/festival_activites/admin-actions";
import type { ProofDisplayState } from "@/app/lib/festival_activites/types";

const FormSchema = z.object({
	promoHighlight: z.string().trim().max(20, "Máximo 20 caracteres").optional(),
	promoDescription: z
		.string()
		.trim()
		.min(1, "El detalle es requerido")
		.max(30, "Máximo 30 caracteres"),
	promoConditions: z.string().trim().max(80, "Máximo 80 caracteres").optional(),
});

type CouponBookProofFormProps = {
	participationId: number;
	proofDisplayState: ProofDisplayState;
	adminFeedback?: string | null;
	existingPromoHighlight?: string | null;
	existingPromoDescription?: string | null;
	existingPromoConditions?: string | null;
	onSuccess?: () => void;
};

type PreviewData = {
	imageUrl: string | null;
	participantName: string | null;
	standLabels: string[];
	sectorName: string | null;
};

export default function CouponBookProofForm({
	participationId,
	proofDisplayState,
	adminFeedback,
	existingPromoHighlight,
	existingPromoDescription,
	existingPromoConditions,
	onSuccess,
}: CouponBookProofFormProps) {
	const [previewData, setPreviewData] = useState<PreviewData | null>(null);

	useEffect(() => {
		fetchParticipationPreviewData(participationId).then((data) => {
			if (data) setPreviewData(data);
		});
	}, [participationId]);

	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			promoHighlight: existingPromoHighlight ?? "",
			promoDescription: existingPromoDescription ?? "",
			promoConditions: existingPromoConditions ?? "",
		},
	});

	const promoHighlight = form.watch("promoHighlight") ?? "";
	const promoDescription = form.watch("promoDescription");
	const promoConditions = form.watch("promoConditions") ?? "";

	const onSubmit = form.handleSubmit(async (data) => {
		const result = await upsertActivityParticipantProof(participationId, {
			promoHighlight: data.promoHighlight || undefined,
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
			<CouponBookCardPreview
				imageUrl={previewData?.imageUrl}
				participantName={previewData?.participantName}
				standLabels={previewData?.standLabels}
				sectorName={previewData?.sectorName}
				promoHighlight={promoHighlight}
				promoDescription={promoDescription}
				promoConditions={promoConditions}
			/>

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
						name="promoHighlight"
						render={({ field }) => (
							<FormItem>
								<div className="flex justify-between items-baseline">
									<FormLabel>
										Destacado{" "}
										<span className="text-muted-foreground font-normal">
											(opcional)
										</span>
									</FormLabel>
									<span className="text-xs text-muted-foreground">
										{promoHighlight.length}/20
									</span>
								</div>
								<FormControl>
									<Input
										maxLength={20}
										placeholder="Ej: 2x1, 10%, Combo"
										{...field}
									/>
								</FormControl>
								<p className="text-xs text-muted-foreground">
									El texto que más llama la atención en el cupón
								</p>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="promoDescription"
						render={({ field }) => (
							<FormItem>
								<div className="flex justify-between items-baseline">
									<FormLabel>Detalle</FormLabel>
									<span className="text-xs text-muted-foreground">
										{promoDescription.length}/30
									</span>
								</div>
								<FormControl>
									<Input
										maxLength={30}
										placeholder="Ej: en stickers y llaveros"
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
