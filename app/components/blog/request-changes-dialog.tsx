"use client";

import { MessageSquareWarning } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { requestChanges } from "@/app/lib/posts/actions";

type Props = {
	postId: number;
	disabled?: boolean;
	onDone?: () => void;
};

export default function RequestChangesDialog({
	postId,
	disabled,
	onDone,
}: Props) {
	const [open, setOpen] = useState(false);
	const [notes, setNotes] = useState("");
	const [isPending, startTransition] = useTransition();

	function submit() {
		startTransition(async () => {
			const res = await requestChanges(postId, { notes });
			if (res.success) {
				toast.success("Se enviaron los comentarios al autor");
				setOpen(false);
				setNotes("");
				onDone?.();
			} else {
				toast.error(res.message);
			}
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled || isPending}
				>
					<MessageSquareWarning className="mr-1 h-4 w-4" />
					Solicitar cambios
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Solicitar cambios al autor</DialogTitle>
					<DialogDescription>
						Explícale al autor qué hace falta ajustar antes de aprobar la
						publicación.
					</DialogDescription>
				</DialogHeader>
				<Textarea
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					placeholder="Por ejemplo: corregir los títulos de las secciones, agregar imagen de portada, revisar la cita en el segundo párrafo…"
					rows={6}
					maxLength={2000}
					disabled={isPending}
				/>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={submit}
						disabled={isPending || notes.trim().length < 10}
					>
						Enviar comentarios
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
