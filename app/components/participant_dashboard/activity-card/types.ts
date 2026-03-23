export type ActivityTheme = {
	bg: string;
	border: string;
	accent: string;
	accentText: string;
	textPrimary: string;
	textSecondary: string;
	buttonBg: string;
	buttonText: string;
	isPrimary: boolean;
};

export type EnrolledConfig = {
	pendingLabel: string;
	pendingDescription: string;
	ctaLabel: string;
	ctaType: "upload" | "link";
	deadlineDate: Date | null;
	isPending: boolean;
	isDestructive?: boolean;
};
