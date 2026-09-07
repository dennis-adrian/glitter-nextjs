"use server";

import ProfileCompletionReminderTemplate from "@/app/emails/profile-completion-reminder";
import ProfileDeletionTemplate from "@/app/emails/profile-deletion";
import {
  ScheduledTaskWithProfile,
  ScheduledTaskWithProfileAndReservation,
} from "@/app/lib/profile_tasks/definitions";
import { anonymizeProgramPurchasesForUser } from "@/app/lib/programs/anonymization";
import { db } from "@/db";
import { pendingUserDeletions, scheduledTasks, users } from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  QueueEmailCallbackOptions,
  queueEmails,
} from "@/app/lib/emails/helpers";
import { BaseProfile } from "@/app/api/users/definitions";
import ReservationReminderTemplate from "@/app/emails/reservation-reminder";
import { deleteClerkUser } from "@/app/lib/users/clerk";

// Leaves headroom under the 100s function limit set in vercel.json so a large
// backlog is drained across runs instead of being killed mid-flight.
const CLERK_DELETION_BUDGET_MS = 60_000;

// Caps the claim itself, so a large backlog cannot produce more post-claim work
// (Clerk calls, deletes, emails) than the budget above can absorb in one run.
const MAX_DELETIONS_PER_RUN = 25;

// Clerk exposes no request timeout, so a hung call would otherwise sit past the
// run deadline; the loop guard only runs between iterations.
const CLERK_CALL_TIMEOUT_MS = 10_000;

// Matches the disciplinary notification outbox: five tries, exponential backoff
// capped at a day, then the row stops retrying and waits for an operator.
const MAX_DELETION_ATTEMPTS = 5;
const MAX_DELETION_BACKOFF_MS = 24 * 60 * 60 * 1000;

const MAX_PERSISTED_ERROR_LENGTH = 120;

/**
 * Postgres driver messages quote the offending row ("Key (email)=(...)"), so
 * only schema-level identifiers are persisted to lastError. The full error
 * still reaches console.error for debugging.
 */
function toLocalDeleteError(error: unknown): string {
  const parts = ["local_delete_failed"];

  if (typeof error === "object" && error !== null) {
    const { code, constraint } = error as {
      code?: unknown;
      constraint?: unknown;
    };
    if (typeof code === "string") parts.push(`sqlstate=${code}`);
    if (typeof constraint === "string") parts.push(`constraint=${constraint}`);
  }

  if (parts.length === 1 && error instanceof Error) {
    parts.push(`type=${error.name}`);
  }

  return parts.join(" ").slice(0, MAX_PERSISTED_ERROR_LENGTH);
}

function computeNextAttemptAt(attemptCount: number, now = new Date()) {
  const delayMs = Math.min(
    60_000 * 2 ** Math.max(attemptCount - 1, 0),
    MAX_DELETION_BACKOFF_MS,
  );
  return new Date(now.getTime() + delayMs);
}

/**
 * Records a failed deletion attempt on its outbox row. Once the attempt cap is
 * reached the row keeps its lastError and stops being claimed, so a profile
 * that can never be deleted does not consume a slot on every run.
 */
async function recordDeletionFailure(
  pendingId: number,
  attempts: number,
  lastError: string,
) {
  const now = new Date();
  const nextAttempt = attempts + 1;
  await db
    .update(pendingUserDeletions)
    .set({
      attempts: nextAttempt,
      lastError,
      nextAttemptAt: computeNextAttemptAt(nextAttempt, now),
      updatedAt: now,
    })
    .where(eq(pendingUserDeletions.id, pendingId));
}

type ClerkDeletionOutcome = Awaited<ReturnType<typeof deleteClerkUser>>;

/**
 * Bounds a Clerk deletion by both its own timeout and the run deadline. A
 * timeout is reported as request_failed so the caller records it and retries on
 * a later run; the abandoned request cannot reject, since deleteClerkUser
 * resolves every path.
 */
async function deleteClerkUserWithinDeadline(
  clerkId: string,
  deadline: number,
): Promise<ClerkDeletionOutcome> {
  const budgetMs = Math.min(CLERK_CALL_TIMEOUT_MS, deadline - Date.now());
  if (budgetMs <= 0) {
    return {
      success: false,
      status: "request_failed",
      message: "run deadline reached before the Clerk call started",
    };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      deleteClerkUser(clerkId),
      new Promise<ClerkDeletionOutcome>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              success: false,
              status: "request_failed",
              message: `Clerk call timed out after ${budgetMs}ms`,
            }),
          budgetMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function handleReminderEmails(): Promise<
  ScheduledTaskWithProfile[]
> {
  try {
    return await db.transaction(async (tx) => {
      const pendingTasks = await tx.query.scheduledTasks.findMany({
        where: and(
          isNull(scheduledTasks.completedAt),
          isNull(scheduledTasks.reminderSentAt),
          lte(scheduledTasks.reminderTime, sql`now()`),
          gt(scheduledTasks.dueDate, sql`now()`),
          eq(scheduledTasks.taskType, "profile_creation"),
        ),
        with: {
          profile: true,
        },
      });

      if (pendingTasks.length === 0) return [];

      let updatedTaskIds: number[] = [];
      await queueEmails<ScheduledTaskWithProfile, number[]>(
        pendingTasks,
        sendReminderEmails,
        { referenceEntity: updatedTaskIds, transactionScope: tx },
      );

      return pendingTasks.filter((task) => updatedTaskIds.includes(task.id));
    });
  } catch (error) {
    console.error("Error sending reminder emails", error);
    return [] as ScheduledTaskWithProfile[];
  }
}

export async function handleDeletionEmails(): Promise<
  ScheduledTaskWithProfile[]
> {
  // Started before the claim so the transaction's own cost counts against the
  // run, not just the work that follows it.
  const deadline = Date.now() + CLERK_DELETION_BUDGET_MS;

  try {
    // Claim a bounded batch of overdue tasks and record one outbox row per
    // profile. No external calls run in here, so the transaction stays short.
    const claimed = await db.transaction(async (tx) => {
      // Skip profiles whose outbox row is still backing off or past the attempt
      // cap so they cannot occupy a slot in the bounded batch, then take the
      // oldest first.
      const eligible = await tx
        .selectDistinct({
          taskId: scheduledTasks.id,
          dueDate: scheduledTasks.dueDate,
        })
        .from(scheduledTasks)
        .leftJoin(
          pendingUserDeletions,
          and(
            eq(pendingUserDeletions.userId, scheduledTasks.profileId),
            isNull(pendingUserDeletions.localDeletedAt),
          ),
        )
        .where(
          and(
            isNull(scheduledTasks.completedAt),
            eq(scheduledTasks.ranAfterDueDate, false),
            lte(scheduledTasks.dueDate, sql`now()`),
            eq(scheduledTasks.taskType, "profile_creation"),
            or(
              isNull(pendingUserDeletions.id),
              and(
                lt(pendingUserDeletions.attempts, MAX_DELETION_ATTEMPTS),
                lte(pendingUserDeletions.nextAttemptAt, sql`now()`),
              ),
            ),
          ),
        )
        .orderBy(asc(scheduledTasks.dueDate))
        .limit(MAX_DELETIONS_PER_RUN);

      if (eligible.length === 0) return [];

      const overdueTasks = await tx.query.scheduledTasks.findMany({
        where: inArray(
          scheduledTasks.id,
          eligible.map((row) => row.taskId),
        ),
        with: {
          profile: true,
        },
        orderBy: asc(scheduledTasks.dueDate),
      });

      const entries: {
        task: ScheduledTaskWithProfile;
        pendingId: number;
        clerkAlreadyDeleted: boolean;
        attempts: number;
      }[] = [];

      for (const task of overdueTasks) {
        // Serialize against an overlapping run or a self-service deleteProfile
        // working the same profile. Without this both sides see no active row
        // and insert one, and the duplicate later earns its own notice.
        // Tasks are ordered by dueDate, so concurrent runs take these locks in
        // the same order.
        const [lockedUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, task.profile.id))
          .limit(1)
          .for("update");

        // The profile went away while we waited for the lock.
        if (!lockedUser) continue;

        // A row left over from an earlier run is resumed rather than
        // duplicated; a null clerkDeletedAt just means "not confirmed yet".
        const [existing] = await tx
          .select({
            id: pendingUserDeletions.id,
            clerkDeletedAt: pendingUserDeletions.clerkDeletedAt,
            attempts: pendingUserDeletions.attempts,
          })
          .from(pendingUserDeletions)
          .where(
            and(
              eq(pendingUserDeletions.userId, task.profile.id),
              isNull(pendingUserDeletions.localDeletedAt),
            ),
          )
          .orderBy(desc(pendingUserDeletions.updatedAt))
          .limit(1)
          .for("update");

        if (existing) {
          entries.push({
            task,
            pendingId: existing.id,
            clerkAlreadyDeleted: existing.clerkDeletedAt !== null,
            attempts: existing.attempts,
          });
          continue;
        }

        const [pending] = await tx
          .insert(pendingUserDeletions)
          .values({ userId: task.profile.id, clerkId: task.profile.clerkId })
          .returning({ id: pendingUserDeletions.id });

        entries.push({
          task,
          pendingId: pending.id,
          clerkAlreadyDeleted: false,
          attempts: 0,
        });
      }

      return entries;
    });

    // No early return on an empty claim: notices owed by earlier runs still
    // need draining even when there is nothing new to delete.
    const completedTasks: ScheduledTaskWithProfile[] = [];

    for (const { task, pendingId, clerkAlreadyDeleted, attempts } of claimed) {
      // Whatever is left stays queued for the next run instead of overrunning
      // the cron's function timeout.
      if (Date.now() >= deadline) break;

      // Tracks what the row actually holds, which the Clerk step below resets.
      let currentAttempts = attempts;

      // Clerk goes first: a live credential with no local profile would be
      // recreated as a brand new profile on the next sign in.
      if (!clerkAlreadyDeleted) {
        const result = await deleteClerkUserWithinDeadline(
          task.profile.clerkId,
          deadline,
        );
        if (result.status === "request_failed") {
          await recordDeletionFailure(
            pendingId,
            currentAttempts,
            `clerk_delete_failed: ${result.message}`,
          );
          continue;
        }

        const clerkDeletedAt = new Date();
        await db
          .update(pendingUserDeletions)
          .set({
            clerkDeletedAt,
            lastError: null,
            attempts: 0,
            nextAttemptAt: clerkDeletedAt,
            updatedAt: clerkDeletedAt,
          })
          .where(eq(pendingUserDeletions.id, pendingId));
        currentAttempts = 0;
      }

      try {
        const now = new Date();
        await db.transaction(async (tx) => {
          // Keep program purchases but strip their personal data. Their FK is
          // RESTRICT, so the delete below would abort without this.
          await anonymizeProgramPurchasesForUser(tx, task.profile.id);

          await tx.delete(users).where(eq(users.id, task.profile.id));

          // scheduled_tasks.profile_id is ON DELETE CASCADE, so the delete
          // above already removed this task's row; no flag to set.
          // The address is carried on the outbox row because the profile it
          // came from no longer exists once this transaction commits.
          await tx
            .update(pendingUserDeletions)
            .set({
              localDeletedAt: now,
              lastError: null,
              recipientEmail: task.profile.email,
              // Hand the email phase a clean budget: a row resumed from an
              // earlier failure would otherwise inherit a future nextAttemptAt
              // and have its notice held back for no reason.
              attempts: 0,
              nextAttemptAt: now,
              updatedAt: now,
            })
            .where(eq(pendingUserDeletions.id, pendingId));
        });

        completedTasks.push(task);
      } catch (error) {
        console.error("Error deleting profile locally", error);
        await recordDeletionFailure(
          pendingId,
          currentAttempts,
          toLocalDeleteError(error),
        );
      }
    }

    await drainDeletionEmails(deadline);

    return completedTasks;
  } catch (error) {
    console.error("Error handling deletion emails", error);
    return [] as ScheduledTaskWithProfile[];
  }
}

async function sendReminderEmails(
  task: ScheduledTaskWithProfile,
  options?: QueueEmailCallbackOptions<number[]>,
) {
  if (!options) return;

  const { referenceEntity: updatedTaskIds, transactionScope: tx } = options;
  if (!(tx && updatedTaskIds)) return;

  const { data, error } = await sendEmail({
    from: "Equipo de Glitter <no-reply@productoraglitter.com>",
    to: [task.profile.email],
    subject: "Completa tu perfil para participar de nuestros eventos",
    react: ProfileCompletionReminderTemplate({
      task,
    }) as React.ReactElement,
  });

  if (data) {
    const updatedTaskId = await tx
      .update(scheduledTasks)
      .set({
        reminderSentAt: sql`now()`,
      })
      .where(eq(scheduledTasks.id, task.id))
      .returning({ id: scheduledTasks.id });

    updatedTaskIds.push(updatedTaskId[0].id);
  }

  if (error) {
    console.error("Error sending reminder emails", error);
  }
}

type PendingDeletionEmail = {
  pendingId: number;
  recipientEmail: string;
  attempts: number;
};

/**
 * Resend errors can echo the address back in their message, so only the error
 * class and status are persisted. Mirrors toLocalDeleteError.
 */
function toDeletionEmailError(error: unknown): string {
  const parts = ["email_send_failed"];

  if (typeof error === "object" && error !== null) {
    const { name, statusCode } = error as {
      name?: unknown;
      statusCode?: unknown;
    };
    if (typeof name === "string") parts.push(`name=${name}`);
    if (typeof statusCode === "number") parts.push(`status=${statusCode}`);
  }

  return parts.join(" ").slice(0, MAX_PERSISTED_ERROR_LENGTH);
}

/**
 * Records a failed notice attempt on its outbox row. At the cap the address is
 * dropped, which both stops the retries and releases the only piece of the
 * deleted profile still being held.
 */
async function recordDeletionEmailFailure(
  pendingId: number,
  attempts: number,
  error: unknown,
) {
  const now = new Date();
  const nextAttempt = attempts + 1;
  const exhausted = nextAttempt >= MAX_DELETION_ATTEMPTS;

  await db
    .update(pendingUserDeletions)
    .set({
      attempts: nextAttempt,
      lastError: toDeletionEmailError(error),
      nextAttemptAt: computeNextAttemptAt(nextAttempt, now),
      ...(exhausted ? { recipientEmail: null } : {}),
      updatedAt: now,
    })
    .where(eq(pendingUserDeletions.id, pendingId));
}

/**
 * Sends the notice for one already-deleted profile and only then stamps
 * emailSentAt, so a failed or interrupted send is picked up by a later run.
 * The address is cleared at the same time: it was retained solely to get this
 * message out.
 */
async function sendDeletionEmails(
  entry: PendingDeletionEmail,
  options?: QueueEmailCallbackOptions<number>,
) {
  const deadline = options?.referenceEntity;
  if (deadline !== undefined && Date.now() >= deadline) return;

  const { data, error } = await sendEmail({
    from: "Equipo de Glitter <no-reply@productoraglitter.com>",
    to: [entry.recipientEmail],
    subject: "Tu cuenta ha sido eliminada",
    react: ProfileDeletionTemplate({
      // The profile row is gone; only the address survived. The template falls
      // back to a generic greeting when the name fields are absent.
      profile: { email: entry.recipientEmail } as BaseProfile,
    }) as React.ReactElement,
  });

  if (error || !data) {
    console.error("Error sending deletion emails", error);
    await recordDeletionEmailFailure(entry.pendingId, entry.attempts, error);
    return;
  }

  const now = new Date();
  await db
    .update(pendingUserDeletions)
    .set({ emailSentAt: now, recipientEmail: null, updatedAt: now })
    .where(eq(pendingUserDeletions.id, entry.pendingId));
}

/**
 * Drains deletion notices still owed, including any left behind by earlier
 * runs. Driven off the outbox rather than this run's in-memory results.
 */
async function drainDeletionEmails(deadline: number) {
  if (Date.now() >= deadline) return;

  const owed = await db
    .select({
      pendingId: pendingUserDeletions.id,
      recipientEmail: pendingUserDeletions.recipientEmail,
      attempts: pendingUserDeletions.attempts,
    })
    .from(pendingUserDeletions)
    .where(
      and(
        isNotNull(pendingUserDeletions.localDeletedAt),
        isNull(pendingUserDeletions.emailSentAt),
        isNotNull(pendingUserDeletions.recipientEmail),
        // Exhausted and backing-off rows are skipped so a permanently failing
        // address cannot hold a slot in every batch.
        lt(pendingUserDeletions.attempts, MAX_DELETION_ATTEMPTS),
        lte(pendingUserDeletions.nextAttemptAt, sql`now()`),
      ),
    )
    .orderBy(asc(pendingUserDeletions.localDeletedAt))
    .limit(MAX_DELETIONS_PER_RUN);

  if (owed.length === 0) return;

  await queueEmails<PendingDeletionEmail, number>(
    owed.map((row) => ({
      pendingId: row.pendingId,
      recipientEmail: row.recipientEmail as string,
      attempts: row.attempts,
    })),
    sendDeletionEmails,
    { referenceEntity: deadline },
  );
}

export async function handleReservationReminderEmails(): Promise<
  ScheduledTaskWithProfileAndReservation[]
> {
  try {
    return await db.transaction(async (tx) => {
      const pendingTasks = (await tx.query.scheduledTasks.findMany({
        where: and(
          isNull(scheduledTasks.completedAt),
          isNull(scheduledTasks.reminderSentAt),
          isNotNull(scheduledTasks.reservationId),
          lte(scheduledTasks.reminderTime, sql`now()`),
          eq(scheduledTasks.taskType, "stand_reservation"),
        ),
        with: {
          reservation: {
            with: {
              stand: true,
              members: { with: { stand: true } },
              festival: true,
            },
          },
          profile: true,
        },
      })) as ScheduledTaskWithProfileAndReservation[];

      if (pendingTasks.length === 0) return [];

      const tasksWithPendingReservations = pendingTasks.filter(
        (task) => task.reservation.status === "pending",
      );

      let updatedTaskIds: number[] = [];
      await queueEmails<ScheduledTaskWithProfileAndReservation, number[]>(
        tasksWithPendingReservations,
        sendReservationReminderEmails,
        { referenceEntity: updatedTaskIds, transactionScope: tx },
      );

      return tasksWithPendingReservations.filter((task) =>
        updatedTaskIds.includes(task.id),
      );
    });
  } catch (error) {
    console.error("Error sending reminder emails", error);
    return [] as ScheduledTaskWithProfileAndReservation[];
  }
}

async function sendReservationReminderEmails(
  task: ScheduledTaskWithProfileAndReservation,
  options?: QueueEmailCallbackOptions<number[]>,
) {
  if (!options) return;

  const { referenceEntity: updatedTaskIds, transactionScope: tx } = options;
  if (!(tx && updatedTaskIds)) return;

  const { data, error } = await sendEmail({
    from: "Equipo de Glitter <reservas@productoraglitter.com>",
    to: [task.profile.email],
    subject: "Recordatorio de pago de reserva",
    react: ReservationReminderTemplate({
      task,
    }) as React.ReactElement,
  });

  if (data) {
    const updatedTaskId = await tx
      .update(scheduledTasks)
      .set({
        reminderSentAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(scheduledTasks.id, task.id))
      .returning({ id: scheduledTasks.id });

    updatedTaskIds.push(updatedTaskId[0].id);
  }

  if (error) {
    console.error("Error sending reminder emails", error);
  }
}
