"use server";

import { NewInfraction } from "@/app/lib/infractions/definitions";
import { db } from "@/db";
import { infractions } from "@/db/schema";
import { revalidatePath } from "next/cache";

export async function fetchInfractionTypes() {
	try {
		return db.query.infractionTypes.findMany({
			orderBy: (infractionTypes, { asc }) => [asc(infractionTypes.label)],
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}

export async function registerInfraction(data: NewInfraction) {
	try {
		await db.insert(infractions).values(data);
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "Error al registrar la infracción",
		};
	}

	revalidatePath(`/dashboard/festivals`);
	return {
		success: true,
		message: "Infracción registrada correctamente",
	};
}
