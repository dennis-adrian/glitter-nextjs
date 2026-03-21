"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { reviewActivityParticipantProof } from "@/app/lib/festival_activites/admin-actions";
import { Button } from "@/app/components/ui/button";
import {
	DrawerDialog,
	DrawerDialogContent,
	DrawerDialogHeader,
	DrawerDialogTitle,
	DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { Textarea } from "@/app/components/ui/textarea";
import { useMediaQuery } from "@/app/hooks/use-media-query";

const FormSchema = z.object({
	adminFeedback: z.string().trim().min(1, "El feedback es requerido"),
});

type RejectProofModalProps = {
	proofId: number;
	mode: "resubmit" | "remove";
	participantName: string;
	onSuccess?: () => void;
};

export default function RejectProofModal({
	proofId,
	mode,
	participantName,
	onSuccess,
}: RejectProofModalProps) {
	const [open, setOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");

	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: { adminFeedback: "" },
	});

	const status = mode === "resubmit" ? "rejected_resubmit" : "rejected_removed";

	const onSubmit = form.handleSubmit(async (data) => {
		const result = await reviewActivityParticipantProof(
			proofId,
			status,
			data.adminFeedback,
		);

		if (result.success) {
			toast.success(result.message);
			setOpen(false);
			onSuccess?.();
		} else {
			toast.error(result.message);
		}
	});

	const isDestructive = mode === "remove";

	return (
		<DrawerDialog open={open} onOpenChange={setOpen} isDesktop={isDesktop}>
			<DrawerDialogTrigger isDesktop={isDesktop}>
				<Button
					variant={isDestructive ? "destructive" : "outline"}
					size="sm"
					className="h-7 px-2 text-xs"
				>
					{mode === "resubmit" ? "Pedir corrección" : "Remover participante"}
				</Button>
			</DrawerDialogTrigger>
			<DrawerDialogContent isDesktop={isDesktop} className="max-w-md">
				<DrawerDialogHeader isDesktop={isDesktop}>
					<DrawerDialogTitle isDesktop={isDesktop}>
						{mode === "resubmit"
							? `Pedir corrección a ${participantName}`
							: `Remover a ${participantName}`}
					</DrawerDialogTitle>
				</DrawerDialogHeader>
				<div className={`${isDesktop ? "" : "px-4 pb-4"} pt-2 space-y-4`}>
					{isDestructive && (
						<p className="text-sm text-destructive">
							Esta acción removerá al participante de la actividad y liberará su
							cupo. No puede deshacerse.
						</p>
					)}
					<Form {...form}>
						<form onSubmit={onSubmit} className="space-y-4">
							<FormField
								control={form.control}
								name="adminFeedback"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Motivo / Feedback</FormLabel>
										<FormControl>
											<Textarea
												className="resize-none"
												rows={3}
												placeholder={
													mode === "resubmit"
														? "Describí qué debe corregir el participante"
														: "Describí el motivo de la remoción"
												}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="submit"
								variant={isDestructive ? "destructive" : "default"}
								className="w-full"
								disabled={form.formState.isSubmitting}
							>
								{form.formState.isSubmitting
									? "Procesando..."
									: mode === "resubmit"
										? "Enviar corrección"
										: "Remover participante"}
							</Button>
						</form>
					</Form>
				</div>
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
