"use server";

import {
  deleteStoredFile,
  type StoredFileDeleteResult,
} from "@/app/lib/uploadthing/storage";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

/**
 * Removes an uploaded file from storage. Only staff form fields call this (the
 * dashboard image inputs and the new-reservation form), so only staff may.
 * Server code deletes through `deleteStoredFile`, which needs no session.
 */
export async function deleteFile(url: string): Promise<StoredFileDeleteResult> {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return { success: false, error: "No autorizado" };

  return deleteStoredFile(url);
}
