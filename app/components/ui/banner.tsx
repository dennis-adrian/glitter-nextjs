import { ReactNode } from "react";
import {
	AlertTriangleIcon,
	InfoIcon,
	CheckCircle2Icon,
	FileTextIcon,
	AlertCircleIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type BannerVariant =
	| "info"
	| "note"
	| "warning"
	| "danger"
	| "success"
	| "primary";

interface InfoBannerProps {
	variant: BannerVariant;
	children: ReactNode;
	title?: string;
	icon?: LucideIcon;
	className?: string;
}

const variantConfig: Record<
	BannerVariant,
	{
		bgColor: string;
		borderColor: string;
		iconColor: string;
		textColor: string;
		defaultIcon: LucideIcon;
	}
> = {
	info: {
		bgColor: "bg-gray-50",
		borderColor: "border-gray-400",
		iconColor: "text-gray-600",
		textColor: "text-gray-800",
		defaultIcon: InfoIcon,
	},
	note: {
		bgColor: "bg-[#F5F5F7]",
		borderColor: "border-[#D1D1D6]",
		iconColor: "text-gray-500",
		textColor: "text-gray-800",
		defaultIcon: FileTextIcon,
	},
	warning: {
		bgColor: "bg-amber-50",
		borderColor: "border-amber-500",
		iconColor: "text-amber-600",
		textColor: "text-amber-900",
		defaultIcon: AlertCircleIcon,
	},
	danger: {
		bgColor: "bg-[#E8356A]/10",
		borderColor: "border-[#E8356A]",
		iconColor: "text-[#E8356A]",
		textColor: "text-foreground",
		defaultIcon: AlertTriangleIcon,
	},
	success: {
		bgColor: "bg-green-50",
		borderColor: "border-green-500",
		iconColor: "text-green-600",
		textColor: "text-green-900",
		defaultIcon: CheckCircle2Icon,
	},
	primary: {
		bgColor: "bg-[#6B21E8]/5",
		borderColor: "border-[#6B21E8]",
		iconColor: "text-[#6B21E8]",
		textColor: "text-foreground",
		defaultIcon: InfoIcon,
	},
};

export function Banner({
	variant,
	children,
	title,
	icon,
	className = "",
}: InfoBannerProps) {
	const config = variantConfig[variant];
	const Icon = icon || config.defaultIcon;

	return (
		<div
			className={`${config.bgColor} border-l-4 ${config.borderColor} rounded-r-lg p-4 ${className}`}
		>
			<div className="flex items-start gap-3">
				<Icon className={`w-5 h-5 ${config.iconColor} shrink-0 mt-0.5`} />
				<div className={`text-sm ${config.textColor} flex-1`}>
					{title && <p className="font-semibold mb-1">{title}</p>}
					<div>{children}</div>
				</div>
			</div>
		</div>
	);
}
