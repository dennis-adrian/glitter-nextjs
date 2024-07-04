"use server";

import { clerkClient } from "@clerk/nextjs/server";

import ProfileCompletionReminderTemplate from "@/app/emails/profile-completion-reminder";
import ProfileDeletionTemplate from "@/app/emails/profile-deletion";
import { ProfileTaskWithProfile } from "@/app/lib/profile_tasks/definitions";
import { db, pool } from "@/db";
import { profileTasks, users } from "@/db/schema";
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
import { queueEmails } from "@/app/lib/emails/helpers";
import { DrizzleTransactionScope } from "@/db/drizzleTransactionScope";

// export async function fetchOverdueTasks() {
//   const client = await pool.connect();
//   try {
//     return await db.query.profileTasks.findMany({
//       where: and(
//         isNull(profileTasks.completedAt),
//         isNotNull(profileTasks.reminderSentAt),
//         lte(profileTasks.dueDate, sql`now()`),
//       ),
//       with: {
//         profile: true,
//       },
//     });
//   } catch (error) {
//     console.error("Error fetching overdue tasks", error);
//     return [];
//   } finally {
//     client.release();
//   }
// }

export async function handleReminderEmails(): Promise<
  ProfileTaskWithProfile[]
> {
  const client = await pool.connect();

  try {
    return await db.transaction(async (tx) => {
      const pendingTasks = await db.query.profileTasks.findMany({
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

      let updatedTaskIds: number[] = [];
      await queueEmails<
        ProfileTaskWithProfile,
        number[],
        DrizzleTransactionScope
      >(pendingTasks, updatedTaskIds, sendReminderEmails, tx);

      return pendingTasks.filter((task) => updatedTaskIds.includes(task.id));
    });
  } catch (error) {
    console.log("Error sending reminder emails", error);
    return [] as ProfileTaskWithProfile[];
  } finally {
    client.release();
  }
}

export async function sendDeletionEmails(): Promise<ProfileTaskWithProfile[]> {
  const client = await pool.connect();

  try {
    return await db.transaction(async (tx) => {
      const overdueTasks = await tx.query.profileTasks.findMany({
        where: and(
          isNull(profileTasks.completedAt),
          isNotNull(profileTasks.reminderSentAt),
          lte(profileTasks.dueDate, sql`now()`),
          eq(profileTasks.taskType, "profile_creation"),
        ),
        with: {
          profile: true,
        },
      });

      if (overdueTasks.length === 0) return [] as ProfileTaskWithProfile[];

      const deletedIds = await tx
        .delete(users)
        .where(
          inArray(
            users.id,
            overdueTasks.map((task) => task.profileId),
          ),
        )
        .returning({ clerkId: users.clerkId });

      deletedIds.forEach(async (user) => {
        await clerkClient.users.deleteUser(user.clerkId);
      });

      overdueTasks.forEach(async (task) => {
        await sendEmail({
          from: "Equipo de Glitter <no-reply@productoraglitter.com>",
          to: [task.profile.email],
          subject: "Tu cuenta ha sido eliminada",
          react: ProfileDeletionTemplate({
            task,
          }) as React.ReactElement,
        });
      });

      return overdueTasks;
    });
  } catch (error) {
    console.log("Error sending reminder emails", error);
    return [] as ProfileTaskWithProfile[];
  } finally {
    client.release();
  }
}

async function sendReminderEmails(
  task: ProfileTaskWithProfile,
  updatedTaskIds: number[],
  tx?: DrizzleTransactionScope,
) {
  if (!tx) return;

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
