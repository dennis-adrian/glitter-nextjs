"use server";

import ProfileCompletionReminderTemplate from "@/app/emails/profile-completion-reminder";
import ProfileDeletionTemplate from "@/app/emails/profile-deletion";
import { ProfileTaskWithProfile } from "@/app/lib/profile_tasks/definitions";
import { db, pool } from "@/db";
import { profileTasks, users } from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  QueueEmailCallbackOptions,
  queueEmails,
} from "@/app/lib/emails/helpers";
import { BaseProfile } from "@/app/api/users/definitions";
import { clerkClient } from "@clerk/nextjs/server";

export async function handleReminderEmails(): Promise<
  ProfileTaskWithProfile[]
> {
  const client = await pool.connect();

  try {
    return await db.transaction(async (tx) => {
      const pendingTasks = await tx.query.profileTasks.findMany({
        where: and(
          isNull(profileTasks.completedAt),
          isNull(profileTasks.reminderSentAt),
          lte(profileTasks.reminderTime, sql`now()`),
          gt(profileTasks.dueDate, sql`now()`),
          eq(profileTasks.taskType, "profile_creation"),
        ),
        with: {
          profile: true,
        },
      });

      if (pendingTasks.length === 0) return [];

      let updatedTaskIds: number[] = [];
      await queueEmails<ProfileTaskWithProfile, number[]>(
        pendingTasks,
        sendReminderEmails,
        { referenceEntity: updatedTaskIds, transactionScope: tx },
      );

      return pendingTasks.filter((task) => updatedTaskIds.includes(task.id));
    });
  } catch (error) {
    console.error("Error sending reminder emails", error);
    return [] as ProfileTaskWithProfile[];
  } finally {
    client.release();
  }
}

export async function handleDeletionEmails(): Promise<
  ProfileTaskWithProfile[]
> {
  const client = await pool.connect();

  try {
    return await db.transaction(async (tx) => {
      const overdueTasks = await tx.query.profileTasks.findMany({
        where: and(
          isNull(profileTasks.completedAt),
          lte(profileTasks.dueDate, sql`now()`),
          eq(profileTasks.taskType, "profile_creation"),
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
            overdueTasks.map((task) => task.profileId),
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

      return overdueTasks.filter((task) => deletedUsers.includes(task.profile));
    });
  } catch (error) {
    console.error("Error sending reminder emails", error);
    return [] as ProfileTaskWithProfile[];
  } finally {
    client.release();
  }
}

async function sendReminderEmails(
  task: ProfileTaskWithProfile,
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
      .update(profileTasks)
      .set({
        reminderSentAt: sql`now()`,
      })
      .where(eq(profileTasks.id, task.id))
      .returning({ id: profileTasks.id });

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
