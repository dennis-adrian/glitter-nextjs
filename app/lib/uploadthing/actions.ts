"use server";

import { utapi } from "@/app/server/uploadthing";

function getUploadThingFileKey(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (
      parsedUrl.hostname === "utfs.io" ||
      parsedUrl.hostname === "ufs.sh" ||
      parsedUrl.hostname.endsWith(".ufs.sh")
    ) {
      const fileKey = parsedUrl.pathname.split("/f/")[1];
      return fileKey || null;
    }
  } catch {
    return null;
  }

  return null;
}

export async function deleteFile(url: string) {
  try {
    const key = getUploadThingFileKey(url);
    if (key) {
      await utapi.deleteFiles(key);
    }
    return { success: true };
  } catch (error) {
    console.error("Error deleting file", error);
    return { success: false, error: "Error al eliminar el archivo" };
  }
}
