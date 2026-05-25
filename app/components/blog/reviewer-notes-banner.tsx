import { MessageSquareWarning } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import type { PostStatus } from "@/app/lib/posts/definitions";

type Props = {
	status: PostStatus;
	notes: string | null;
	scope?: "main" | "working";
};

export default function ReviewerNotesBanner({
	status,
	notes,
	scope = "main",
}: Props) {
	if (!notes) return null;
	if (scope === "main" && status !== "draft" && status !== "rejected") {
		return null;
	}

	const title =
		scope === "working"
			? "El equipo de revisión solicitó cambios sobre tus ediciones"
			: status === "rejected"
				? "Tu artículo fue rechazado"
				: "El equipo de revisión solicitó cambios";

	return (
		<Alert className="border-amber-300 bg-amber-50">
			<MessageSquareWarning className="h-4 w-4 text-amber-600" />
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription className="whitespace-pre-line">
				{notes}
			</AlertDescription>
		</Alert>
	);
}
