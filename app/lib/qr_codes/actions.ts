"use server";

import { db } from "@/db";
import { qrCodes, stands } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { NewQrCode } from "./definitions";

export async function getQRCode(amount: number) {
	try {
		return await db.query.qrCodes.findFirst({
			where: and(
				eq(qrCodes.amount, amount),
				gt(qrCodes.expirationDate, new Date()),
			),
			orderBy: [asc(qrCodes.expirationDate)],
		});
	} catch (error) {
		console.error(error);
		return null;
	}
}

export async function fetchQrCodes() {
	try {
		return await db.query.qrCodes.findMany({
			orderBy: [asc(qrCodes.expirationDate)],
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}

export async function fetchQrCode(id: number) {
	try {
		return await db.query.qrCodes.findFirst({
			where: eq(qrCodes.id, id),
		});
	} catch (error) {
		console.error(error);
		return null;
	}
}

export async function createQrCode(data: NewQrCode) {
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return { success: false, message: "No tienes permisos para esta acción." };
	}

	try {
		await db.insert(qrCodes).values(data);
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo crear el código QR." };
	}

	revalidatePath("/dashboard/qr_codes");
	return { success: true, message: "Código QR creado correctamente." };
}

export async function updateQrCode(id: number, data: Partial<NewQrCode>) {
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return { success: false, message: "No tienes permisos para esta acción." };
	}

	try {
		const existing = await db.query.qrCodes.findFirst({
			where: eq(qrCodes.id, id),
		});
		if (!existing) {
			return { success: false, message: "Código QR no encontrado." };
		}

		const previousQrCodeUrl =
			data.qrCodeUrl && data.qrCodeUrl !== existing.qrCodeUrl
				? existing.qrCodeUrl
				: null;

		await db
			.update(qrCodes)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(qrCodes.id, id));

		if (previousQrCodeUrl) {
			try {
				await deleteFile(previousQrCodeUrl);
			} catch (deleteError) {
				console.error(deleteError);
			}
		}
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo actualizar el código QR." };
	}

	revalidatePath("/dashboard/qr_codes");
	return { success: true, message: "Código QR actualizado correctamente." };
}

export async function deleteQrCode(id: number) {
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return { success: false, message: "No tienes permisos para esta acción." };
	}

	let deletedUrl: string | null = null;

	try {
		await db.transaction(async (tx) => {
			const existing = await tx.query.qrCodes.findFirst({
				where: eq(qrCodes.id, id),
			});
			if (!existing) throw new Error("Código QR no encontrado");
			deletedUrl = existing.qrCodeUrl;

			await tx
				.update(stands)
				.set({ qrCodeId: null })
				.where(eq(stands.qrCodeId, id));

			await tx.delete(qrCodes).where(eq(qrCodes.id, id));
		});
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo eliminar el código QR." };
	}

	if (deletedUrl) {
		await deleteFile(deletedUrl);
	}

	revalidatePath("/dashboard/qr_codes");
	return { success: true, message: "Código QR eliminado correctamente." };
}
