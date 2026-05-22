"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";

import { cn } from "@/app/lib/utils";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
	status: SaveStatus;
	errorMessage?: string;
};

const LABELS: Record<SaveStatus, string> = {
	idle: "Sin cambios",
	saving: "Guardando…",
	saved: "Guardado",
	error: "Error al guardar",
};

export default function SaveIndicator({ status, errorMessage }: Props) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs",
				status === "saved" && "border-emerald-200 text-emerald-700",
				status === "saving" && "text-muted-foreground",
				status === "error" && "border-red-200 text-red-700",
				status === "idle" && "text-muted-foreground",
			)}
			title={status === "error" ? errorMessage : undefined}
		>
			{status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
			{status === "saved" && <Check className="h-3 w-3" />}
			{status === "error" && <AlertCircle className="h-3 w-3" />}
			{status === "idle" && (
				<span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
			)}
			{LABELS[status]}
		</span>
	);
}
