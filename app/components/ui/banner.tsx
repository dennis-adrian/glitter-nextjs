import { ReactNode } from "react";
import {
  AlertTriangleIcon,
  InfoIcon,
  CheckCircle2Icon,
  FileTextIcon,
  AlertCircleIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type BannerVariant =
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
    bgColor: "bg-gray-50 dark:bg-muted/60",
    borderColor: "border-gray-400 dark:border-muted-foreground/50",
    iconColor: "text-gray-600 dark:text-muted-foreground",
    textColor: "text-gray-800 dark:text-foreground",
    defaultIcon: InfoIcon,
  },
  note: {
    bgColor: "bg-[#F5F5F7] dark:bg-muted/60",
    borderColor: "border-[#D1D1D6] dark:border-border",
    iconColor: "text-gray-500 dark:text-muted-foreground",
    textColor: "text-gray-800 dark:text-foreground",
    defaultIcon: FileTextIcon,
  },
  warning: {
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
    borderColor: "border-amber-500 dark:border-amber-500/70",
    iconColor: "text-amber-600 dark:text-amber-400",
    textColor: "text-amber-900 dark:text-amber-100",
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
    bgColor: "bg-green-50 dark:bg-green-950/40",
    borderColor: "border-green-500 dark:border-green-500/70",
    iconColor: "text-green-600 dark:text-green-400",
    textColor: "text-green-900 dark:text-green-100",
    defaultIcon: CheckCircle2Icon,
  },
  primary: {
    // #6B21E8 is too dark to read on the dark ground; primary is lifted there.
    bgColor: "bg-[#6B21E8]/5 dark:bg-primary/10",
    borderColor: "border-[#6B21E8] dark:border-primary",
    iconColor: "text-[#6B21E8] dark:text-primary",
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
      className={`${config.bgColor} border ${config.borderColor} rounded-lg p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 ${config.iconColor} shrink-0 mt-0.5`} />
        <div className={`text-sm ${config.textColor} flex-1`}>
          {title && <p className="font-semibold mb-1">{title}</p>}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}
