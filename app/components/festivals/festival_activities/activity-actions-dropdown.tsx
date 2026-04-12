"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Button } from "@/app/components/ui/button";
import {
	CheckIcon,
	CopyIcon,
	MoreHorizontalIcon,
	VoteIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type ActivityActionsDropdownProps = {
	festivalId: number;
	activityId: number;
	allowsVoting: boolean;
};

export default function ActivityActionsDropdown({
	festivalId,
	activityId,
	allowsVoting,
}: ActivityActionsDropdownProps) {
	const [copiedActivity, setCopiedActivity] = useState(false);
	const [copiedVoting, setCopiedVoting] = useState(false);

	useEffect(() => {
		if (copiedActivity) {
			const url =
				window.location.origin +
				`/festivals/${festivalId}/activity/${activityId}`;
			navigator.clipboard.writeText(url);
			toast("Enlace copiado al portapapeles");
			const t = setTimeout(() => setCopiedActivity(false), 2000);
			return () => clearTimeout(t);
		}
	}, [copiedActivity, festivalId, activityId]);

	useEffect(() => {
		if (copiedVoting) {
			const url =
				window.location.origin +
				`/festivals/${festivalId}/activity/${activityId}/voting`;
			navigator.clipboard.writeText(url);
			toast("Enlace de votación copiado al portapapeles");
			const t = setTimeout(() => setCopiedVoting(false), 2000);
			return () => clearTimeout(t);
		}
	}, [copiedVoting, festivalId, activityId]);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					<MoreHorizontalIcon className="w-4 h-4" />
					<span className="sr-only">Acciones</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => setCopiedActivity(true)}>
					{copiedActivity ? (
						<CheckIcon className="w-4 h-4 mr-2" />
					) : (
						<CopyIcon className="w-4 h-4 mr-2" />
					)}
					Copiar enlace para participar
				</DropdownMenuItem>
				{allowsVoting && (
					<DropdownMenuItem onClick={() => setCopiedVoting(true)}>
						{copiedVoting ? (
							<CheckIcon className="w-4 h-4 mr-2" />
						) : (
							<VoteIcon className="w-4 h-4 mr-2" />
						)}
						Copiar enlace de votación
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
