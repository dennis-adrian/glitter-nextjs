"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { removeActivityParticipant } from "@/app/lib/festival_activites/admin-actions";
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
	reason: z.string().trim().min(1, "El motivo es requerido"),
});

type RemoveParticipantModalProps = {
	participationId: number;
	participantName: string;
};

export default function RemoveParticipantModal({
	participationId,
	participantName,
}: RemoveParticipantModalProps) {
	const [open, setOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const router = useRouter();

	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: { reason: "" },
	});

	const onSubmit = form.handleSubmit(async (data) => {
		try {
			const result = await removeActivityParticipant(
				participationId,
				data.reason,
			);

			if (!result.success) {
				toast.error(result.message);
				return;
			}

			toast.success(result.message);
			form.reset();
			setOpen(false);
			router.refresh();
		} catch {
			toast.error("No se pudo remover al participante. Intentá nuevamente.");
		}
	});

	return (
		<DrawerDialog open={open} onOpenChange={setOpen} isDesktop={isDesktop}>
			<DrawerDialogTrigger isDesktop={isDesktop}>
				<Button variant="destructive" size="sm" className="h-7 px-2 text-xs">
					Remover participante
				</Button>
			</DrawerDialogTrigger>
			<DrawerDialogContent isDesktop={isDesktop} className="max-w-md">
				<DrawerDialogHeader isDesktop={isDesktop}>
					<DrawerDialogTitle isDesktop={isDesktop}>
						Remover a {participantName}
					</DrawerDialogTitle>
				</DrawerDialogHeader>
				<div className={`${isDesktop ? "" : "px-4 pb-4"} pt-2 space-y-4`}>
					<p className="text-sm text-destructive">
						Esta acción removerá al participante de la actividad y liberará su
						cupo. Podés revertirla desde la lista de participantes con el botón
						Restaurar.
					</p>
					<Form {...form}>
						<form onSubmit={onSubmit} className="space-y-4">
							<FormField
								control={form.control}
								name="reason"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Motivo</FormLabel>
										<FormControl>
											<Textarea
												className="resize-none"
												rows={3}
												placeholder="Describí el motivo de la remoción"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="submit"
								variant="destructive"
								className="w-full"
								disabled={form.formState.isSubmitting}
							>
								{form.formState.isSubmitting
									? "Procesando..."
									: "Remover participante"}
							</Button>
						</form>
					</Form>
				</div>
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
