"use server";

import ProfileCompletionReminderTemplate from "@/app/emails/profile-completion-reminder";
import ProfileDeletionTemplate from "@/app/emails/profile-deletion";
import {
  ScheduledTaskWithProfile,
  ScheduledTaskWithProfileAndReservation,
} from "@/app/lib/profile_tasks/definitions";
import { anonymizeProgramPurchasesForUser } from "@/app/lib/programs/anonymization";
import { db } from "@/db";
import {
  pendingUserDeletions,
  scheduledTasks,
  standReservations,
  users,
} from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import {
  and,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
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
      const overdueTasks = await tx.query.scheduledTasks.findMany({
        where: and(
          isNull(scheduledTasks.completedAt),
          eq(scheduledTasks.ranAfterDueDate, false),
          lte(scheduledTasks.dueDate, sql`now()`),
          eq(scheduledTasks.taskType, "profile_creation"),
        ),
        with: {
          profile: true,
        },
        limit: MAX_DELETIONS_PER_RUN,
      });

      const entries: {
        task: ScheduledTaskWithProfile;
        pendingId: number;
        clerkAlreadyDeleted: boolean;
      }[] = [];

      for (const task of overdueTasks) {
        // A row left over from an earlier run is resumed rather than
        // duplicated; a null clerkDeletedAt just means "not confirmed yet".
        const [existing] = await tx
          .select({
            id: pendingUserDeletions.id,
            clerkDeletedAt: pendingUserDeletions.clerkDeletedAt,
          })
          .from(pendingUserDeletions)
          .where(
            and(
              eq(pendingUserDeletions.userId, task.profile.id),
              isNull(pendingUserDeletions.localDeletedAt),
            ),
          )
          .orderBy(desc(pendingUserDeletions.updatedAt))
          .limit(1);

        if (existing) {
          entries.push({
            task,
            pendingId: existing.id,
            clerkAlreadyDeleted: existing.clerkDeletedAt !== null,
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
        });
      }

      return entries;
    });

    if (claimed.length === 0) return [];

    const completedTasks: ScheduledTaskWithProfile[] = [];
    const deletedProfiles: BaseProfile[] = [];

    for (const { task, pendingId, clerkAlreadyDeleted } of claimed) {
      // Whatever is left stays queued for the next run instead of overrunning
      // the cron's function timeout.
      if (Date.now() >= deadline) break;

      // Clerk goes first: a live credential with no local profile would be
      // recreated as a brand new profile on the next sign in.
      if (!clerkAlreadyDeleted) {
        const result = await deleteClerkUserWithinDeadline(
          task.profile.clerkId,
          deadline,
        );
        if (result.status === "request_failed") {
          await db
            .update(pendingUserDeletions)
            .set({
              lastError: `clerk_delete_failed: ${result.message}`,
              updatedAt: new Date(),
            })
            .where(eq(pendingUserDeletions.id, pendingId));
          continue;
        }

        const clerkDeletedAt = new Date();
        await db
          .update(pendingUserDeletions)
          .set({ clerkDeletedAt, lastError: null, updatedAt: clerkDeletedAt })
          .where(eq(pendingUserDeletions.id, pendingId));
      }

      try {
        const now = new Date();
        const [deletedUser] = await db.transaction(async (tx) => {
          // Keep program purchases but strip their personal data. Their FK is
          // RESTRICT, so the delete below would abort without this.
          await anonymizeProgramPurchasesForUser(tx, task.profile.id);

          const rows = await tx
            .delete(users)
            .where(eq(users.id, task.profile.id))
            .returning();

          // scheduled_tasks.profile_id is ON DELETE CASCADE, so the delete
          // above already removed this task's row; no flag to set.
          await tx
            .update(pendingUserDeletions)
            .set({ localDeletedAt: now, lastError: null, updatedAt: now })
            .where(eq(pendingUserDeletions.id, pendingId));

          return rows;
        });

        if (deletedUser) deletedProfiles.push(deletedUser);
        completedTasks.push(task);
      } catch (error) {
        console.error("Error deleting profile locally", error);
        await db
          .update(pendingUserDeletions)
          .set({
            lastError: `local_delete_failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            updatedAt: new Date(),
          })
          .where(eq(pendingUserDeletions.id, pendingId));
      }
    }

    await queueEmails<BaseProfile, undefined>(
      deletedProfiles,
      sendDeletionEmails,
    );

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

async function sendDeletionEmails(profile: BaseProfile) {
  const { error } = await sendEmail({
    from: "Equipo de Glitter <no-reply@productoraglitter.com>",
    to: [profile.email],
    subject: "Tu cuenta ha sido eliminada",
    react: ProfileDeletionTemplate({
      profile,
    }) as React.ReactElement,
  });

  if (error) {
    console.error("Error sending deletion emails", error);
  }
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
