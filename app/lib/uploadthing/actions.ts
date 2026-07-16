"use server";

import { eq } from "drizzle-orm";

import { utapi } from "@/app/server/uploadthing";
import { db } from "@/db";
import { storageCleanupJobs } from "@/db/schema";

export const STORAGE_CLEANUP_ENTITY_TYPES = [
  "invoice_voucher",
  "profile_image",
  "activity_proof",
  "qr_code",
  "product_image",
  "external_participant_image",
] as const;

export type StorageCleanupEntityType =
  (typeof STORAGE_CLEANUP_ENTITY_TYPES)[number];

type StorageCleanupTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
    } else {
      console.warn("Could not extract UploadThing file key from URL:", url);
      return { success: false, error: "No se pudo identificar el archivo" };
    }
    return { success: true };
  } catch (error) {
    console.error("Error deleting file", error);
    return { success: false, error: "Error al eliminar el archivo" };
  }
}

/** Enqueue a durable UploadThing cleanup job (optionally inside a DB transaction). */
export async function enqueueStorageCleanupJob(
  {
    entityType,
    entityId,
    fileUrl,
  }: {
    entityType: StorageCleanupEntityType | (string & {});
    entityId?: number | null;
    fileUrl: string;
  },
  tx?: StorageCleanupTx,
) {
  const dbClient = tx ?? db;
  const [job] = await dbClient
    .insert(storageCleanupJobs)
    .values({
      entityType,
      entityId: entityId ?? null,
      fileUrl,
    })
    .returning({ id: storageCleanupJobs.id });

  return job;
}

export async function markStorageCleanupJobCompleted(jobId: number) {
  await db
    .update(storageCleanupJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      attempts: 1,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(storageCleanupJobs.id, jobId));
}

export async function markStorageCleanupJobFailed(
  jobId: number,
  error: string,
) {
  await db
    .update(storageCleanupJobs)
    .set({
      lastError: error,
      attempts: 1,
      updatedAt: new Date(),
    })
    .where(eq(storageCleanupJobs.id, jobId));
}

/**
 * Attempt an immediate delete for a just-enqueued cleanup job.
 * On success the job is completed; on failure it stays pending for retry.
 */
export async function attemptStorageCleanupJob(
  jobId: number,
  fileUrl: string,
  context?: Record<string, unknown>,
) {
  const deleteResult = await deleteFile(fileUrl);
  if (deleteResult.success) {
    await markStorageCleanupJobCompleted(jobId);
    return deleteResult;
  }

  await markStorageCleanupJobFailed(
    jobId,
    deleteResult.error ?? "Unknown cleanup error",
  );
  console.error("Storage cleanup failed; outbox retained for retry", {
    jobId,
    fileUrl,
    error: deleteResult.error,
    ...context,
  });
  return deleteResult;
}

/** Retries pending storage cleanup outbox rows across all entity types. */
export async function processPendingStorageCleanupJobs(limit = 20) {
  const pendingJobs = await db.query.storageCleanupJobs.findMany({
    where: eq(storageCleanupJobs.status, "pending"),
    limit,
    orderBy: (jobs, { asc }) => [asc(jobs.createdAt)],
  });

  let completed = 0;
  for (const job of pendingJobs) {
    const deleteResult = await deleteFile(job.fileUrl);
    if (deleteResult.success) {
      await db
        .update(storageCleanupJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          lastError: null,
          attempts: job.attempts + 1,
          updatedAt: new Date(),
        })
        .where(eq(storageCleanupJobs.id, job.id));
      completed += 1;
    } else {
      await db
        .update(storageCleanupJobs)
        .set({
          lastError: deleteResult.error ?? "Unknown cleanup error",
          attempts: job.attempts + 1,
          updatedAt: new Date(),
        })
        .where(eq(storageCleanupJobs.id, job.id));
      console.error("Storage cleanup job retry failed", {
        jobId: job.id,
        entityType: job.entityType,
        entityId: job.entityId,
        fileUrl: job.fileUrl,
        error: deleteResult.error,
      });
    }
  }

  return { processed: pendingJobs.length, completed };
}
