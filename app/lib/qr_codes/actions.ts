"use server";

import { db } from "@/db";
import { qrCodes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getQRCode(amount: number) {
	try {
		return await db.query.qrCodes.findFirst({
			where: eq(qrCodes.amount, amount),
		});
	} catch (error) {
		console.error(error);
		return null;
	}
}
