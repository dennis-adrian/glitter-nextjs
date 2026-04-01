"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Textarea } from "@/app/components/ui/textarea";
import {
	updateLiveActAdminNotes,
	updateLiveActStatus,
} from "@/app/lib/live_acts/actions";
import { LiveAct } from "@/app/lib/live_acts/definitions";

export function LiveActActionsCell({ liveAct }: { liveAct: LiveAct }) {
	const router = useRouter();
	const [notesOpen, setNotesOpen] = useState(false);
	const [notes, setNotes] = useState(liveAct.adminNotes ?? "");
	const [savingNotes, setSavingNotes] = useState(false);
	const [savingStatus, setSavingStatus] = useState(false);

	async function handleStatusChange(
		status: "approved" | "backlog" | "rejected",
	) {
		setSavingStatus(true);
		try {
			const res = await updateLiveActStatus(liveAct.id, status);
			if (res.success) {
				toast.success(res.message);
				router.refresh();
			} else {
				toast.error(res.message);
			}
		} catch (err) {
			toast.error("Error al actualizar el estado");
		} finally {
			setSavingStatus(false);
		}
	}

	async function handleSaveNotes() {
		setSavingNotes(true);
		try {
			const res = await updateLiveActAdminNotes(liveAct.id, notes);
			if (res.success) {
				toast.success(res.message);
				setNotesOpen(false);
				router.refresh();
			} else {
				toast.error(res.message);
			}
		} catch (err) {
			toast.error("Error al guardar las notas");
		} finally {
			setSavingNotes(false);
		}
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className="h-8 w-8 p-0"
						disabled={savingStatus}
					>
						<span className="sr-only">Abrir menú</span>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuLabel>Acciones</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						disabled={liveAct.status === "approved" || savingStatus}
						asChild
					>
						<form
							className="w-full"
							action={() => handleStatusChange("approved")}
						>
							<button
								className="w-full text-left"
								type="submit"
								disabled={liveAct.status === "approved" || savingStatus}
							>
								Aprobar
							</button>
						</form>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={liveAct.status === "backlog" || savingStatus}
						asChild
					>
						<form
							className="w-full"
							action={() => handleStatusChange("backlog")}
						>
							<button
								className="w-full text-left"
								type="submit"
								disabled={liveAct.status === "backlog" || savingStatus}
							>
								En lista de espera
							</button>
						</form>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={liveAct.status === "rejected" || savingStatus}
						asChild
					>
						<form
							className="w-full"
							action={() => handleStatusChange("rejected")}
						>
							<button
								className="w-full text-left"
								type="submit"
								disabled={liveAct.status === "rejected" || savingStatus}
							>
								Rechazar
							</button>
						</form>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						disabled={savingStatus}
						onSelect={() => setNotesOpen(true)}
					>
						{liveAct.adminNotes ? "Editar notas" : "Agregar notas"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={notesOpen} onOpenChange={setNotesOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Notas — {liveAct.actName}</DialogTitle>
					</DialogHeader>
					<Textarea
						className="min-h-32 resize-none"
						placeholder="Notas internas sobre este acto..."
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
					/>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setNotesOpen(false)}
							disabled={savingNotes}
						>
							Cancelar
						</Button>
						<Button onClick={handleSaveNotes} disabled={savingNotes}>
							{savingNotes ? "Guardando..." : "Guardar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
