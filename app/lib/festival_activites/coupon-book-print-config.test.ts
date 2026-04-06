import { describe, expect, it } from "vitest";

import { resolvePdfCanvasConfig } from "@/app/lib/festival_activites/coupon-book-print-config";

describe("coupon-book-print-config", () => {
	it("keeps landscape output large enough for one coupon page", () => {
		const config = resolvePdfCanvasConfig(
			new URLSearchParams({
				pdfWcm: "12",
				pdfHcm: "11",
				pdfOrientation: "landscape",
			}),
		);

		expect(config).toEqual({
			widthCm: 21.59,
			heightCm: 16.5,
			orientation: "landscape",
		});
	});

	it("keeps portrait output large enough for one coupon page", () => {
		const config = resolvePdfCanvasConfig(
			new URLSearchParams({
				pdfWcm: "12",
				pdfHcm: "11",
				pdfOrientation: "portrait",
			}),
		);

		expect(config).toEqual({
			widthCm: 21.59,
			heightCm: 21.59,
			orientation: "portrait",
		});
	});

	it("preserves larger inputs while normalizing by orientation", () => {
		const config = resolvePdfCanvasConfig(
			new URLSearchParams({
				pdfWcm: "30",
				pdfHcm: "24",
				pdfOrientation: "portrait",
			}),
		);

		expect(config).toEqual({
			widthCm: 24,
			heightCm: 30,
			orientation: "portrait",
		});
	});
});
