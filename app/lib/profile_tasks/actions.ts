"use server";

import ProfileCompletionReminderTemplate from "@/app/emails/profile-completion-reminder";
import ProfileDeletionTemplate from "@/app/emails/profile-deletion";
import {
  ScheduledTaskWithProfile,
  ScheduledTaskWithProfileAndReservation,
} from "@/app/lib/profile_tasks/definitions";
import { db, pool } from "@/db";
import { scheduledTasks, standReservations, users } from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import {
  and,
  eq,
  gt,
  inArray,
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
import { clerkClient } from "@clerk/nextjs/server";
import ReservationReminderTemplate from "@/app/emails/reservation-reminder";

export async function handleReminderEmails(): Promise<
  ScheduledTaskWithProfile[]
> {
  const client = await pool.connect();

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
  } finally {
    client.release();
  }
}

export async function handleDeletionEmails(): Promise<
  ScheduledTaskWithProfile[]
> {
  const client = await pool.connect();

  try {
    return await db.transaction(async (tx) => {
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
      });

      if (overdueTasks.length === 0) return [];

      const deletedUsers = await tx
        .delete(users)
        .where(
          inArray(
            users.id,
            overdueTasks.map((task) => task.profileId!),
          ),
        )
        .returning();

      deletedUsers.forEach(async (user) => {
        await clerkClient.users.deleteUser(user.clerkId);
      });

      await queueEmails<BaseProfile, undefined>(
        deletedUsers,
        sendDeletionEmails,
      );

      await tx
        .update(scheduledTasks)
        .set({ ranAfterDueDate: true })
        .where(
          inArray(
            scheduledTasks.id,
            deletedUsers.map((user) => user.id),
          ),
        );

      return overdueTasks.filter((task) => deletedUsers.includes(task.profile));
    });
  } catch (error) {
    console.error("Error sending reminder emails", error);
    return [] as ScheduledTaskWithProfile[];
  } finally {
    client.release();
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
    console.error("Error sending reminder emails", error);
  }
}

export async function handleReservationReminderEmails(): Promise<
  ScheduledTaskWithProfileAndReservation[]
> {
  const client = await pool.connect();

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
      console.log(
        "all pending tasks",
        pendingTasks.map((task) => {
          return {
            reservationId: task.reservation.id,
            profileEmail: task.profile.email,
            festivalName: task.reservation.festival.name,
            profileName: task.profile.displayName,
          };
        }),
      );

      if (pendingTasks.length === 0) return [];

      const tasksWithPendingReservations = pendingTasks.filter(
        (task) => task.reservation.status === "pending",
      );
      console.log(
        "tasksWithPendingReservations",
        tasksWithPendingReservations.map((task) => ({
          reservationId: task.reservation.id,
          profileEmail: task.profile.email,
          festivalName: task.reservation.festival.name,
          profileName: task.profile.displayName,
        })),
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
  } finally {
    client.release();
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
