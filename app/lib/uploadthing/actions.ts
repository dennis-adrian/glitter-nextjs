"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

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
type StorageCleanupJob = typeof storageCleanupJobs.$inferSelect;

const MAX_ATTEMPTS = 5;
const LEASE_DURATION_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

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

function computeNextAttemptAt(attemptCount: number): Date {
  const delayMs = Math.min(
    60_000 * 2 ** Math.max(attemptCount - 1, 0),
    MAX_BACKOFF_MS,
  );
  return new Date(Date.now() + delayMs);
}

function leaseExpiryDate(from = new Date()) {
  return new Date(from.getTime() + LEASE_DURATION_MS);
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
  const now = new Date();
  const [job] = await dbClient
    .insert(storageCleanupJobs)
    .values({
      entityType,
      entityId: entityId ?? null,
      fileUrl,
      status: "pending",
      nextAttemptAt: now,
      attempts: 0,
    })
    .returning({ id: storageCleanupJobs.id });

  return job;
}

async function claimStorageCleanupJobById(jobId: number, owner: string) {
  const now = new Date();
  const [claimed] = await db
    .update(storageCleanupJobs)
    .set({
      status: "processing",
      leaseOwner: owner,
      leaseExpiresAt: leaseExpiryDate(now),
      updatedAt: now,
    })
    .where(
      and(
        eq(storageCleanupJobs.id, jobId),
        sql`(
          ${storageCleanupJobs.status} = 'pending'
          OR (
            ${storageCleanupJobs.status} = 'processing'
            AND ${storageCleanupJobs.leaseExpiresAt} IS NOT NULL
            AND ${storageCleanupJobs.leaseExpiresAt} < ${now}
          )
        )`,
        sql`${storageCleanupJobs.nextAttemptAt} <= ${now}`,
      ),
    )
    .returning();

  return claimed ?? null;
}

async function claimDueStorageCleanupJobs(limit: number, owner: string) {
  const now = new Date();
  const leaseExpiresAt = leaseExpiryDate(now);

  const result = await db.execute(sql`
    WITH due AS (
      SELECT id
      FROM storage_cleanup_jobs
      WHERE (
          status = 'pending'
          OR (
            status = 'processing'
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < ${now}
          )
        )
        AND next_attempt_at <= ${now}
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE storage_cleanup_jobs AS jobs
    SET
      status = 'processing',
      lease_owner = ${owner},
      lease_expires_at = ${leaseExpiresAt},
      updated_at = ${now}
    FROM due
    WHERE jobs.id = due.id
    RETURNING jobs.id
  `);

  const claimedIds = (result.rows ?? [])
    .map((row) => Number((row as { id: number | string }).id))
    .filter((id) => Number.isFinite(id));

  if (claimedIds.length === 0) {
    return [] as StorageCleanupJob[];
  }

  return db.query.storageCleanupJobs.findMany({
    where: and(
      inArray(storageCleanupJobs.id, claimedIds),
      eq(storageCleanupJobs.leaseOwner, owner),
      eq(storageCleanupJobs.status, "processing"),
    ),
    orderBy: [asc(storageCleanupJobs.createdAt)],
  });
}

async function completeClaimedStorageCleanupJob(
  job: StorageCleanupJob,
  owner: string,
) {
  const now = new Date();
  const [updated] = await db
    .update(storageCleanupJobs)
    .set({
      status: "completed",
      completedAt: now,
      lastError: null,
      attempts: job.attempts + 1,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(storageCleanupJobs.id, job.id),
        eq(storageCleanupJobs.status, "processing"),
        eq(storageCleanupJobs.leaseOwner, owner),
      ),
    )
    .returning({ id: storageCleanupJobs.id });

  return updated != null;
}

async function failOrRescheduleClaimedStorageCleanupJob(
  job: StorageCleanupJob,
  owner: string,
  error: string,
) {
  const now = new Date();
  const nextAttempts = job.attempts + 1;
  const terminal = nextAttempts >= MAX_ATTEMPTS;

  const [updated] = await db
    .update(storageCleanupJobs)
    .set({
      status: terminal ? "failed" : "pending",
      lastError: error,
      attempts: nextAttempts,
      nextAttemptAt: terminal
        ? job.nextAttemptAt
        : computeNextAttemptAt(nextAttempts),
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(storageCleanupJobs.id, job.id),
        eq(storageCleanupJobs.status, "processing"),
        eq(storageCleanupJobs.leaseOwner, owner),
      ),
    )
    .returning({
      id: storageCleanupJobs.id,
      status: storageCleanupJobs.status,
    });

  return updated ?? null;
}

/**
 * Attempt an immediate delete for a just-enqueued cleanup job.
 * Claims the row first; on failure schedules retry via nextAttemptAt backoff.
 */
export async function attemptStorageCleanupJob(
  jobId: number,
  fileUrl: string,
  context?: Record<string, unknown>,
) {
  const owner = randomUUID();
  const claimed = await claimStorageCleanupJobById(jobId, owner);
  if (!claimed) {
    console.error(
      "Storage cleanup claim failed; job left for scheduled retry",
      {
        jobId,
        fileUrl,
        ...context,
      },
    );
    return {
      success: false,
      error: "No se pudo reclamar el trabajo de limpieza",
    };
  }

  const deleteResult = await deleteFile(fileUrl);
  if (deleteResult.success) {
    const completed = await completeClaimedStorageCleanupJob(claimed, owner);
    if (!completed) {
      console.error(
        "Storage cleanup succeeded but claimant could not complete job",
        {
          jobId,
          owner,
          ...context,
        },
      );
    }
    return deleteResult;
  }

  const error = deleteResult.error ?? "Unknown cleanup error";
  const updated = await failOrRescheduleClaimedStorageCleanupJob(
    claimed,
    owner,
    error,
  );
  console.error("Storage cleanup failed; outbox retained for retry", {
    jobId,
    fileUrl,
    error,
    status: updated?.status,
    ...context,
  });
  return deleteResult;
}

/**
 * Cron/worker entrypoint: claim due cleanup jobs and process UploadThing deletes.
 * Pending jobs with future nextAttemptAt, terminal failures, and active leases are skipped.
 */
export async function processPendingStorageCleanupJobs(limit = 20) {
  const owner = randomUUID();
  let claimedJobs: StorageCleanupJob[];

  try {
    claimedJobs = await claimDueStorageCleanupJobs(limit, owner);
  } catch (error) {
    console.error(
      "[processPendingStorageCleanupJobs] Failed to claim due cleanup jobs",
      error,
    );
    throw error;
  }

  let completed = 0;
  let failed = 0;
  let rescheduled = 0;

  for (const job of claimedJobs) {
    try {
      const deleteResult = await deleteFile(job.fileUrl);
      if (deleteResult.success) {
        const didComplete = await completeClaimedStorageCleanupJob(job, owner);
        if (didComplete) {
          completed += 1;
        } else {
          console.error(
            "[processPendingStorageCleanupJobs] Delete succeeded but claim was lost",
            { jobId: job.id, owner },
          );
        }
        continue;
      }

      const error = deleteResult.error ?? "Unknown cleanup error";
      const updated = await failOrRescheduleClaimedStorageCleanupJob(
        job,
        owner,
        error,
      );
      if (updated?.status === "failed") {
        failed += 1;
        console.error(
          "[processPendingStorageCleanupJobs] Job reached terminal failure",
          {
            jobId: job.id,
            entityType: job.entityType,
            entityId: job.entityId,
            fileUrl: job.fileUrl,
            error,
            attempts: job.attempts + 1,
          },
        );
      } else if (updated) {
        rescheduled += 1;
        console.error(
          "[processPendingStorageCleanupJobs] Job rescheduled after failure",
          {
            jobId: job.id,
            entityType: job.entityType,
            entityId: job.entityId,
            fileUrl: job.fileUrl,
            error,
            attempts: job.attempts + 1,
          },
        );
      } else {
        console.error(
          "[processPendingStorageCleanupJobs] Failure handling skipped; claim was lost",
          { jobId: job.id, owner, error },
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected cleanup error";
      const updated = await failOrRescheduleClaimedStorageCleanupJob(
        job,
        owner,
        message,
      );
      if (updated?.status === "failed") {
        failed += 1;
      } else if (updated) {
        rescheduled += 1;
      }
      console.error(
        "[processPendingStorageCleanupJobs] Unexpected error while processing job",
        {
          jobId: job.id,
          entityType: job.entityType,
          entityId: job.entityId,
          fileUrl: job.fileUrl,
          error,
        },
      );
    }
  }

  return {
    claimed: claimedJobs.length,
    completed,
    failed,
    rescheduled,
  };
}
