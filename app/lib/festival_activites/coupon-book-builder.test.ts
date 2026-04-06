import { describe, expect, it } from "vitest";

import {
	COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE,
	COUPON_BOOK_PAGE_HEIGHT_CM,
	COUPON_BOOK_PAGE_WIDTH_CM,
	buildCouponBookVariants,
	paginateCouponBookEntries,
} from "@/app/lib/festival_activites/coupon-book-builder";

describe("coupon-book-builder", () => {
	it("keeps the required printable dimensions", () => {
		expect(COUPON_BOOK_PAGE_WIDTH_CM).toBe(21.59);
		expect(COUPON_BOOK_PAGE_HEIGHT_CM).toBe(16.5);
	});

	it("builds entries only from approved/pending text proofs", () => {
		const variants = buildCouponBookVariants({
			details: [
				{
					id: 11,
					description: "Variante A",
					imageUrl: null,
					participants: [
						{
							id: 1,
							removedAt: null,
							user: {
								displayName: "Alpha",
								firstName: null,
								lastName: null,
								imageUrl: null,
							},
							proofs: [
								{
									imageUrl: null,
									promoHighlight: "2x1",
									promoDescription: "en sodas",
									promoConditions: "Hasta agotar stock",
									proofStatus: "approved",
								},
							],
						},
						{
							id: 2,
							removedAt: null,
							user: {
								displayName: "Beta",
								firstName: null,
								lastName: null,
								imageUrl: null,
							},
							proofs: [
								{
									imageUrl: null,
									promoHighlight: null,
									promoDescription: "10% en llaveros",
									promoConditions: null,
									proofStatus: "pending_review",
								},
							],
						},
						{
							id: 3,
							removedAt: null,
							user: {
								displayName: "Gamma",
								firstName: null,
								lastName: null,
								imageUrl: null,
							},
							proofs: [
								{
									imageUrl: null,
									promoHighlight: null,
									promoDescription: "No debería entrar",
									promoConditions: null,
									proofStatus: "rejected_resubmit",
								},
							],
						},
						{
							id: 4,
							removedAt: new Date(),
							user: {
								displayName: "Delta",
								firstName: null,
								lastName: null,
								imageUrl: null,
							},
							proofs: [
								{
									imageUrl: null,
									promoHighlight: null,
									promoDescription: "No debería entrar",
									promoConditions: null,
									proofStatus: "approved",
								},
							],
						},
					],
				},
			],
		});

		expect(variants).toHaveLength(1);
		expect(variants[0].entries).toHaveLength(2);
		expect(variants[0].entries.map((entry) => entry.participantName)).toEqual([
			"Alpha",
			"Beta",
		]);
	});

	it("resolves internal header image identifiers to safe internal URLs", () => {
		const variants = buildCouponBookVariants({
			details: [
				{
					id: 22,
					description: "Variante Header",
					couponBookHeaderImageUrl: "uploadthing:abc123-safeAssetKey",
					participants: [],
				},
			],
		});

		expect(variants[0].headerImageUrl).toBe(
			"https://utfs.io/f/abc123-safeAssetKey",
		);
	});

	it("drops non-allowlisted header image URLs from rendered variants", () => {
		const variants = buildCouponBookVariants({
			details: [
				{
					id: 33,
					description: "Variante Header",
					couponBookHeaderImageUrl: "https://evil.example.com/payload.png",
					participants: [],
				},
			],
		});

		expect(variants[0].headerImageUrl).toBeNull();
	});

	it("paginates using header-dynamic slot + 25 body slots", () => {
		const entries = Array.from(
			{ length: COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE + 3 },
			(_, index) => ({
				participationId: index + 1,
				participantName: `P${index + 1}`,
				standLabels: [],
				sectorName: null,
				promoHighlight: "",
				promoDescription: `Promo ${index + 1}`,
				promoConditions: null,
				imageUrl: null,
				proofStatus: "approved" as const,
			}),
		);

		const pages = paginateCouponBookEntries(entries);
		expect(pages).toHaveLength(2);
		expect(pages[0].headerDynamicEntry?.participantName).toBe("P1");
		expect(pages[0].bodyEntries).toHaveLength(25);
		expect(pages[1].headerDynamicEntry?.participantName).toBe("P27");
		expect(pages[1].totalPages).toBe(2);
	});
});
