import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/lib/utils";
import {
	type QrCodeStatus,
	qrCodeStatusLabels,
} from "@/app/lib/qr_codes/status";

const statusClassNames: Record<QrCodeStatus, string> = {
	active: "bg-emerald-100 border-emerald-300 text-emerald-900",
	expiring_soon: "bg-amber-100 border-amber-300 text-amber-900",
	expired: "bg-red-100 border-red-300 text-red-900",
};

export default function QrCodeStatusBadge({
	status,
}: {
	status: QrCodeStatus;
}) {
	return (
		<Badge variant="outline" className={cn("border", statusClassNames[status])}>
			{qrCodeStatusLabels[status]}
		</Badge>
	);
}
