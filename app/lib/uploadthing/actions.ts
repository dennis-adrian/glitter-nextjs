"use server";

import { and, eq, sql } from "drizzle-orm";
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
/** Keep headroom under the lease for completion/reschedule DB writes. */
const DELETE_TIMEOUT_MS = LEASE_DURATION_MS - 30_000;
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

type UtDeleteFilesOptions = NonNullable<
  Parameters<typeof utapi.deleteFiles>[1]
>;

/**
 * UploadThing's DeleteFilesOptions currently only exposes `keyType`.
 * Flip this when the SDK accepts AbortSignal for delete cancellation.
 */
function utapiDeleteFilesSupportsAbortSignal(): boolean {
  return false;
}

function deleteFilesOptions(
  signal?: AbortSignal,
): UtDeleteFilesOptions | undefined {
  if (!signal || !utapiDeleteFilesSupportsAbortSignal()) {
    return undefined;
  }
  return { signal } as UtDeleteFilesOptions;
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function deleteFile(url: string, signal?: AbortSignal) {
  try {
    if (signal?.aborted) {
      return { success: false, error: "Storage delete was cancelled" };
    }

    const key = getUploadThingFileKey(url);
    if (!key) {
      console.warn("Could not extract UploadThing file key from URL:", url);
      return { success: false, error: "No se pudo identificar el archivo" };
    }

    await utapi.deleteFiles(key, deleteFilesOptions(signal));
    return { success: true };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      return { success: false, error: "Storage delete was cancelled" };
    }
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

/** List due job ids oldest-first without claiming; claim happens per job. */
async function selectDueStorageCleanupJobIds(limit: number) {
  const now = new Date();
  const result = await db.execute(sql`
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
  `);

  return (result.rows ?? [])
    .map((row) => Number((row as { id: number | string }).id))
    .filter((id) => Number.isFinite(id));
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

async function deleteFileWithinLease(url: string) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deletePromise = deleteFile(url, controller.signal);

  try {
    const outcome = await Promise.race([
      deletePromise.then((result) => ({ type: "settled" as const, result })),
      new Promise<{ type: "timeout" }>((resolve) => {
        timeoutId = setTimeout(
          () => resolve({ type: "timeout" }),
          DELETE_TIMEOUT_MS,
        );
      }),
    ]);

    if (outcome.type === "settled") {
      return outcome.result;
    }

    // Cancel the UploadThing request when the SDK supports AbortSignal.
    if (utapiDeleteFilesSupportsAbortSignal()) {
      controller.abort();
    }

    // Always wait for the in-flight delete to settle so callers cannot
    // reschedule while the original deletion remains in flight.
    await deletePromise;

    return {
      success: false as const,
      error: "Storage delete exceeded lease-safe timeout",
    };
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

async function processClaimedStorageCleanupJob(
  job: StorageCleanupJob,
  owner: string,
) {
  // Bound the external delete so it cannot outlive the claim lease.
  const deleteResult = await deleteFileWithinLease(job.fileUrl);
  if (deleteResult.success) {
    const completed = await completeClaimedStorageCleanupJob(job, owner);
    return {
      deleteResult,
      outcome: completed ? ("completed" as const) : ("claim_lost" as const),
    };
  }

  const error = deleteResult.error ?? "Unknown cleanup error";
  const updated = await failOrRescheduleClaimedStorageCleanupJob(
    job,
    owner,
    error,
  );
  if (!updated) {
    return {
      deleteResult,
      outcome: "claim_lost" as const,
      error,
    };
  }

  return {
    deleteResult,
    outcome:
      updated.status === "failed"
        ? ("failed" as const)
        : ("rescheduled" as const),
    error,
  };
}

/**
 * Attempt an immediate delete for a just-enqueued cleanup job.
 * Claims the row first and deletes the claimed job URL only.
 */
export async function attemptStorageCleanupJob(
  jobId: number,
  context?: Record<string, unknown>,
) {
  const owner = randomUUID();
  const claimed = await claimStorageCleanupJobById(jobId, owner);
  if (!claimed) {
    console.error(
      "Storage cleanup claim failed; job left for scheduled retry",
      {
        jobId,
        ...context,
      },
    );
    return {
      success: false,
      error: "No se pudo reclamar el trabajo de limpieza",
    };
  }

  const { deleteResult, outcome, error } =
    await processClaimedStorageCleanupJob(claimed, owner);

  if (outcome === "completed") {
    return deleteResult;
  }

  if (outcome === "claim_lost" && deleteResult.success) {
    console.error(
      "Storage cleanup succeeded but claimant could not complete job",
      {
        jobId,
        owner,
        fileUrl: claimed.fileUrl,
        ...context,
      },
    );
    return deleteResult;
  }

  console.error("Storage cleanup failed; outbox retained for retry", {
    jobId,
    fileUrl: claimed.fileUrl,
    error: error ?? deleteResult.error,
    status: outcome,
    ...context,
  });
  return deleteResult;
}

/**
 * Cron/worker entrypoint: claim each due job immediately before deletion.
 * Avoids batch leases expiring while earlier jobs are still being processed.
 */
export async function processPendingStorageCleanupJobs(limit = 20) {
  let dueIds: number[];

  try {
    dueIds = await selectDueStorageCleanupJobIds(limit);
  } catch (error) {
    console.error(
      "[processPendingStorageCleanupJobs] Failed to select due cleanup jobs",
      error,
    );
    throw error;
  }

  let claimedCount = 0;
  let completed = 0;
  let failed = 0;
  let rescheduled = 0;

  for (const jobId of dueIds) {
    const owner = randomUUID();
    let job: StorageCleanupJob | null;

    try {
      job = await claimStorageCleanupJobById(jobId, owner);
    } catch (error) {
      console.error(
        "[processPendingStorageCleanupJobs] Failed to claim cleanup job",
        { jobId, error },
      );
      continue;
    }

    if (!job) {
      // Another worker claimed it, or it is no longer due.
      continue;
    }

    claimedCount += 1;

    try {
      const { deleteResult, outcome, error } =
        await processClaimedStorageCleanupJob(job, owner);

      if (outcome === "completed") {
        completed += 1;
        continue;
      }

      if (outcome === "claim_lost") {
        console.error(
          "[processPendingStorageCleanupJobs] Claim was lost after processing",
          {
            jobId: job.id,
            owner,
            deleteSucceeded: deleteResult.success,
            error,
          },
        );
        continue;
      }

      if (outcome === "failed") {
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
        continue;
      }

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
    due: dueIds.length,
    claimed: claimedCount,
    completed,
    failed,
    rescheduled,
  };
}
