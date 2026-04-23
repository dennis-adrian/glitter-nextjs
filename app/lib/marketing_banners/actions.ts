"use server";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { marketingBanners } from "@/db/schema";
import { and, asc, eq, inArray, max, or } from "drizzle-orm";
import { cacheLife, cacheTag, revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type {
	MarketingBannerAudience,
	MarketingBannerRow,
} from "./definitions";
import { assertValidHref } from "./validate-href";

const CACHE_TAG = "marketing-banners";

function canManageBanners(
	role: string | null | undefined,
): role is "admin" | "festival_admin" {
	return role === "admin" || role === "festival_admin";
}

function invalidateBanners() {
	updateTag(CACHE_TAG);
	revalidatePath("/", "page");
	revalidatePath("/portal", "page");
	revalidatePath("/dashboard/banners", "layout");
}

export async function fetchMarketingBannersForLanding(
	isAuthenticated: boolean,
): Promise<MarketingBannerRow[]> {
	"use cache";
	cacheLife("minutes");
	cacheTag(CACHE_TAG);

	try {
		if (isAuthenticated) {
			return await db
				.select()
				.from(marketingBanners)
				.where(
					and(
						eq(marketingBanners.isVisible, true),
						eq(marketingBanners.audience, "all"),
					),
				)
				.orderBy(asc(marketingBanners.sortOrder), asc(marketingBanners.id));
		}
		return await db
			.select()
			.from(marketingBanners)
			.where(
				and(
					eq(marketingBanners.isVisible, true),
					or(
						eq(marketingBanners.audience, "all"),
						eq(marketingBanners.audience, "public_only"),
					),
				),
			)
			.orderBy(asc(marketingBanners.sortOrder), asc(marketingBanners.id));
	} catch (error) {
		console.error("fetchMarketingBannersForLanding", error);
		return [];
	}
}

export async function fetchMarketingBannersForPortal(): Promise<
	MarketingBannerRow[]
> {
	"use cache";
	cacheLife("minutes");
	cacheTag(CACHE_TAG);

	try {
		return await db
			.select()
			.from(marketingBanners)
			.where(
				and(
					eq(marketingBanners.isVisible, true),
					inArray(marketingBanners.audience, ["all", "participants_only"]),
				),
			)
			.orderBy(asc(marketingBanners.sortOrder), asc(marketingBanners.id));
	} catch (error) {
		console.error("fetchMarketingBannersForPortal", error);
		return [];
	}
}

/** Dashboard `/dashboard/banners`; layout also restricts access — this check runs before any DB read. */
export async function listMarketingBannersForAdmin(): Promise<
	MarketingBannerRow[]
> {
	const profile = await getCurrentUserProfile();
	if (!profile) {
		redirect("/sign_in");
	}
	if (!canManageBanners(profile.role)) {
		redirect("/");
	}
	return db
		.select()
		.from(marketingBanners)
		.orderBy(asc(marketingBanners.sortOrder), asc(marketingBanners.id));
}

export async function getMarketingBannerById(
	id: number,
): Promise<MarketingBannerRow | null> {
	const profile = await getCurrentUserProfile();
	if (!profile) {
		redirect("/sign_in");
	}
	if (!canManageBanners(profile.role)) {
		redirect("/");
	}
	const rows = await db
		.select()
		.from(marketingBanners)
		.where(eq(marketingBanners.id, id))
		.limit(1);
	return rows[0] ?? null;
}

function optUrl(v: string | null | undefined): string | null {
	const t = v?.trim();
	return t || null;
}

export type CreateMarketingBannerInput = {
	/** Required — desktop / 4:1 style */
	imageUrl: string;
	imageUrlTablet?: string | null;
	imageUrlMobile?: string | null;
	href: string;
	audience: MarketingBannerAudience;
	openInNewTab?: boolean;
	isVisible?: boolean;
	label?: string | null;
	altText?: string | null;
};

export async function createMarketingBanner(
	data: CreateMarketingBannerInput,
): Promise<
	{ success: true; id: number } | { success: false; message: string }
> {
	const profile = await getCurrentUserProfile();
	if (!canManageBanners(profile?.role)) {
		return { success: false, message: "No tienes permisos." };
	}
	const hrefCheck = assertValidHref(data.href);
	if (!hrefCheck.ok) {
		return { success: false, message: hrefCheck.message };
	}
	if (!data.imageUrl?.trim()) {
		return { success: false, message: "La imagen es obligatoria." };
	}

	const [{ maxOrder }] = await db
		.select({ maxOrder: max(marketingBanners.sortOrder) })
		.from(marketingBanners);
	const nextOrder = (maxOrder ?? -1) + 1;

	const [row] = await db
		.insert(marketingBanners)
		.values({
			imageUrl: data.imageUrl.trim(),
			imageUrlTablet: optUrl(data.imageUrlTablet ?? null),
			imageUrlMobile: optUrl(data.imageUrlMobile ?? null),
			href: hrefCheck.href,
			audience: data.audience,
			openInNewTab: data.openInNewTab ?? false,
			isVisible: data.isVisible ?? true,
			label: data.label?.trim() || null,
			altText: data.altText?.trim() || null,
			sortOrder: nextOrder,
			updatedAt: new Date(),
			createdAt: new Date(),
		})
		.returning({ id: marketingBanners.id });

	if (!row) {
		return { success: false, message: "No se pudo crear el banner." };
	}
	invalidateBanners();
	return { success: true, id: row.id };
}

export type UpdateMarketingBannerInput = {
	id: number;
	imageUrl: string;
	imageUrlTablet?: string | null;
	imageUrlMobile?: string | null;
	href: string;
	audience: MarketingBannerAudience;
	openInNewTab: boolean;
	isVisible: boolean;
	label?: string | null;
	altText?: string | null;
};

export async function updateMarketingBanner(
	data: UpdateMarketingBannerInput,
): Promise<{ success: true } | { success: false; message: string }> {
	const profile = await getCurrentUserProfile();
	if (!canManageBanners(profile?.role)) {
		return { success: false, message: "No tienes permisos." };
	}
	const hrefCheck = assertValidHref(data.href);
	if (!hrefCheck.ok) {
		return { success: false, message: hrefCheck.message };
	}
	if (!data.imageUrl?.trim()) {
		return { success: false, message: "La imagen es obligatoria." };
	}

	const [updated] = await db
		.update(marketingBanners)
		.set({
			imageUrl: data.imageUrl.trim(),
			imageUrlTablet: optUrl(data.imageUrlTablet ?? null),
			imageUrlMobile: optUrl(data.imageUrlMobile ?? null),
			href: hrefCheck.href,
			audience: data.audience,
			openInNewTab: data.openInNewTab,
			isVisible: data.isVisible,
			label: data.label?.trim() || null,
			altText: data.altText?.trim() || null,
			updatedAt: new Date(),
		})
		.where(eq(marketingBanners.id, data.id))
		.returning({ id: marketingBanners.id });

	if (!updated) {
		return { success: false, message: "Banner no encontrado." };
	}
	invalidateBanners();
	return { success: true };
}

export async function deleteMarketingBanner(
	id: number,
): Promise<{ success: true } | { success: false; message: string }> {
	const profile = await getCurrentUserProfile();
	if (!canManageBanners(profile?.role)) {
		return { success: false, message: "No tienes permisos." };
	}
	const deleted = await db
		.delete(marketingBanners)
		.where(eq(marketingBanners.id, id))
		.returning({ id: marketingBanners.id });
	if (deleted.length === 0) {
		return { success: false, message: "No encontrado." };
	}
	invalidateBanners();
	return { success: true };
}

export async function setMarketingBannerVisible(
	id: number,
	isVisible: boolean,
): Promise<{ success: true } | { success: false; message: string }> {
	const profile = await getCurrentUserProfile();
	if (!canManageBanners(profile?.role)) {
		return { success: false, message: "No tienes permisos." };
	}
	const [u] = await db
		.update(marketingBanners)
		.set({ isVisible, updatedAt: new Date() })
		.where(eq(marketingBanners.id, id))
		.returning({ id: marketingBanners.id });
	if (!u) {
		return { success: false, message: "No encontrado." };
	}
	invalidateBanners();
	return { success: true };
}

export async function reorderMarketingBanners(
	orderedIds: number[],
): Promise<{ success: true } | { success: false; message: string }> {
	const profile = await getCurrentUserProfile();
	if (!canManageBanners(profile?.role)) {
		return { success: false, message: "No tienes permisos." };
	}
	if (orderedIds.length === 0) {
		return { success: true };
	}
	const unique = new Set(orderedIds);
	if (unique.size !== orderedIds.length) {
		return { success: false, message: "Lista inválida." };
	}
	try {
		await db.transaction(async (tx) => {
			for (let i = 0; i < orderedIds.length; i++) {
				await tx
					.update(marketingBanners)
					.set({ sortOrder: i, updatedAt: new Date() })
					.where(eq(marketingBanners.id, orderedIds[i]));
			}
		});
	} catch (e) {
		console.error("reorderMarketingBanners", e);
		return { success: false, message: "Error al reordenar." };
	}
	invalidateBanners();
	return { success: true };
}
