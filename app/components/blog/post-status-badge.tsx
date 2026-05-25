import {
	Archive,
	CalendarClock,
	CheckCircle2,
	CircleEllipsis,
	Eye,
	FileText,
	XCircle,
} from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import {
	POST_STATUS_LABELS,
	type PostStatus,
} from "@/app/lib/posts/definitions";

const STATUS_STYLES: Record<PostStatus, { bg: string; icon: React.ReactNode }> =
	{
		draft: {
			bg: "bg-neutral-500",
			icon: <FileText className="w-4 h-4 mr-1" />,
		},
		submitted: {
			bg: "bg-amber-500",
			icon: <CircleEllipsis className="w-4 h-4 mr-1" />,
		},
		approved: {
			bg: "bg-sky-600",
			icon: <CheckCircle2 className="w-4 h-4 mr-1" />,
		},
		scheduled: {
			bg: "bg-violet-600",
			icon: <CalendarClock className="w-4 h-4 mr-1" />,
		},
		published: {
			bg: "bg-primary-600 hover:bg-primary/90",
			icon: <Eye className="w-4 h-4 mr-1" />,
		},
		rejected: {
			bg: "bg-rose-600",
			icon: <XCircle className="w-4 h-4 mr-1" />,
		},
		archived: {
			bg: "bg-zinc-700",
			icon: <Archive className="w-4 h-4 mr-1" />,
		},
	};

export default function PostStatusBadge({ status }: { status: PostStatus }) {
	const cfg = STATUS_STYLES[status];
	return (
		<Badge className={cfg.bg}>
			{cfg.icon}
			{POST_STATUS_LABELS[status]}
		</Badge>
	);
}
