"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { restoreActivityParticipant } from "@/app/lib/festival_activites/admin-actions";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

type RestoreParticipantButtonProps = {
	participationId: number;
	className?: string;
};

export default function RestoreParticipantButton({
	participationId,
	className,
}: RestoreParticipantButtonProps) {
	const [isRestoring, setIsRestoring] = useState(false);
	const restoringRef = useRef(false);
	const router = useRouter();

	const handleRestore = async () => {
		if (restoringRef.current) return;
		restoringRef.current = true;
		setIsRestoring(true);
		try {
			const result = await restoreActivityParticipant(participationId);
			if (result.success) {
				toast.success(result.message);
				router.refresh();
			} else {
				toast.error(result.message);
			}
		} catch {
			toast.error("No se pudo restaurar al participante. Intentá nuevamente.");
		} finally {
			restoringRef.current = false;
			setIsRestoring(false);
		}
	};

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={isRestoring}
			className={cn(
				"h-7 px-2 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50",
				className,
			)}
			onClick={handleRestore}
		>
			{isRestoring ? (
				<span className="inline-flex items-center gap-1.5">
					<Loader2Icon className="h-3 w-3 animate-spin" aria-hidden />
					Restaurando
				</span>
			) : (
				"Restaurar"
			)}
		</Button>
	);
}
