"use server";

import { db } from "@/db";
import { badges } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { NewBadge } from "./definitions";

export async function createBadge(badge: NewBadge) {
	try {
		await db.insert(badges).values(badge);
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "No se pudo crear la medalla.",
		};
	}

	revalidatePath("/dashboard/badges");
	return {
		success: true,
		message: "Medalla creada correctamente.",
	};
}
