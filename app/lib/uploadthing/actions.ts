"use server";

import { utapi } from "@/app/server/uploadthing";

export async function deleteFile(url: string) {
	try {
		if (url.includes("utfs")) {
			const [_, key] = url.split("/f/");
			await utapi.deleteFiles(key);
		}
		return { success: true };
	} catch (error) {
		console.error("Error deleting file", error);
		return { success: false, error: "Error al eliminar el archivo" };
	}
}
