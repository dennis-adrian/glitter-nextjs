export const COUPON_BOOK_PAGE_WIDTH_CM = 21.59;
export const COUPON_BOOK_PAGE_HEIGHT_CM = 16.5;
export const COUPON_BOOK_COLUMNS = 5;
export const COUPON_BOOK_ROWS = 6;
export const COUPON_BOOK_BODY_SLOTS = 25;
export const COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE = 26; // header dynamic + 25 body

export type CouponTextBoxConfig = {
	xPct: number;
	yPct: number;
	widthPct: number;
	heightPct: number;
	multiline: boolean;
};

export type CouponTextLayoutConfig = {
	leftColumnWidthPct: number;
	standFontSizeMm: number;
	sectorFontSizeMm: number;
	headerImageScalePct: number;
	nameBox: CouponTextBoxConfig;
	highlightBox: CouponTextBoxConfig;
	descriptionBox: CouponTextBoxConfig;
	validityBox: CouponTextBoxConfig;
};

export const DEFAULT_COUPON_TEXT_LAYOUT_CONFIG: CouponTextLayoutConfig = {
	leftColumnWidthPct: 38,
	standFontSizeMm: 2.5,
	sectorFontSizeMm: 2.1,
	headerImageScalePct: 100,
	nameBox: { xPct: 0, yPct: 0, widthPct: 100, heightPct: 24, multiline: true },
	highlightBox: {
		xPct: 0,
		yPct: 25,
		widthPct: 100,
		heightPct: 29,
		multiline: false,
	},
	descriptionBox: {
		xPct: 0,
		yPct: 56,
		widthPct: 100,
		heightPct: 22,
		multiline: true,
	},
	validityBox: {
		xPct: 0,
		yPct: 79,
		widthPct: 100,
		heightPct: 21,
		multiline: true,
	},
};

export type CouponBookEntry = {
	participationId: number | null;
	participantName: string;
	standLabels: string[];
	sectorName: string | null;
	promoHighlight: string;
	promoDescription: string;
	promoConditions: string | null;
	imageUrl: string | null;
	proofStatus: "approved" | "pending_review";
};

export type CouponBookVariant = {
	detailId: number;
	detailLabel: string;
	headerImageUrl: string | null;
	entries: CouponBookEntry[];
};

export type CouponBookPage = {
	pageNumber: number;
	totalPages: number;
	headerDynamicEntry: CouponBookEntry | null;
	bodyEntries: Array<CouponBookEntry | null>;
};

type ActivityProof = {
	imageUrl: string | null;
	promoHighlight: string | null;
	promoDescription: string | null;
	promoConditions: string | null;
	proofStatus:
		| "pending_review"
		| "approved"
		| "rejected_resubmit"
		| "rejected_removed";
};

type ActivityParticipant = {
	id: number;
	removedAt: Date | null;
	user: {
		displayName: string | null;
		firstName: string | null;
		lastName: string | null;
		imageUrl: string | null;
	};
	proofs: ActivityProof[];
};

type ActivityDetailForCouponBook = {
	id: number;
	description: string | null;
	imageUrl?: string | null;
	couponBookHeaderImageUrl?: string | null;
	participants: ActivityParticipant[];
};

type ActivityForCouponBook = {
	details: ActivityDetailForCouponBook[];
};

const INCLUDED_PROOF_STATUSES = new Set<string>(["approved", "pending_review"]);

export const COURTESY_COUPON_ENTRY: CouponBookEntry = {
	participationId: null,
	participantName: "Glitter",
	standLabels: ["G15"],
	sectorName: "Ballivian",
	promoHighlight: "Combo 15Bs",
	promoDescription: "panchito chico + soda",
	promoConditions: "Hasta agotar stock",
	imageUrl: "/img/logo/glitter-logo-dark-160x160.png",
	proofStatus: "approved",
};

function getParticipantName(participant: ActivityParticipant): string {
	const displayName = participant.user.displayName?.trim();
	if (displayName) return displayName;
	const fullName =
		`${participant.user.firstName ?? ""} ${participant.user.lastName ?? ""}`.trim();
	return fullName || "Participante";
}

function getParticipantTextProof(
	participant: ActivityParticipant,
): ActivityProof | null {
	const proof = participant.proofs.find(
		(item) =>
			item.imageUrl === null &&
			(item.promoDescription?.trim()?.length ?? 0) > 0 &&
			INCLUDED_PROOF_STATUSES.has(item.proofStatus),
	);
	return proof ?? null;
}

export function buildCouponBookVariants(
	activity: ActivityForCouponBook,
): CouponBookVariant[] {
	return activity.details.map((detail, detailIndex) => {
		const entries: CouponBookEntry[] = detail.participants
			.filter((participant) => participant.removedAt === null)
			.sort((a, b) => a.id - b.id)
			.map((participant) => {
				const proof = getParticipantTextProof(participant);
				if (!proof) return null;
				return {
					participationId: participant.id,
					participantName: getParticipantName(participant),
					standLabels: [],
					sectorName: null,
					promoHighlight: proof.promoHighlight?.trim() ?? "",
					promoDescription: proof.promoDescription?.trim() ?? "",
					promoConditions: proof.promoConditions?.trim() ?? null,
					imageUrl: participant.user.imageUrl ?? null,
					proofStatus: proof.proofStatus,
				} as CouponBookEntry;
			})
			.filter((entry): entry is CouponBookEntry => entry !== null);

		return {
			detailId: detail.id,
			detailLabel: detail.description?.trim() || `Variante ${detailIndex + 1}`,
			headerImageUrl: detail.couponBookHeaderImageUrl ?? null,
			entries,
		};
	});
}

export function paginateCouponBookEntries(
	entries: CouponBookEntry[],
): CouponBookPage[] {
	const pages: CouponBookPage[] = [];
	for (
		let start = 0, pageNumber = 1;
		start < entries.length || pageNumber === 1;
		start += COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE, pageNumber++
	) {
		const chunk = entries.slice(
			start,
			start + COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE,
		);
		const headerDynamicEntry = chunk[0] ?? null;
		const bodyEntries: Array<CouponBookEntry | null> = chunk.slice(1);
		while (bodyEntries.length < COUPON_BOOK_BODY_SLOTS) bodyEntries.push(null);
		pages.push({
			pageNumber,
			totalPages: 0, // set later
			headerDynamicEntry,
			bodyEntries,
		});
	}

	const totalPages = pages.length;
	return pages.map((page) => ({ ...page, totalPages }));
}
