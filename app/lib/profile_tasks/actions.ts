"use server";

import { clerkClient } from "@clerk/nextjs";

import ProfileCompletionReminderTemplate from "@/app/emails/profile-completion-reminder";
import ProfileDeletionTemplate from "@/app/emails/profile-deletion";
import { ProfileTaskWithProfile } from "@/app/lib/profile_tasks/definitions";
import { db, pool } from "@/db";
import { profileTasks, users } from "@/db/schema";
import { sendEmail } from "@/vendors/resend";
import { and, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

export async function fetchPendingTasks(): Promise<ProfileTaskWithProfile[]> {
  const client = await pool.connect();
  try {
    return await db.query.profileTasks.findMany({
      where: and(
        isNull(profileTasks.completedAt),
        isNull(profileTasks.reminderSentAt),
        gt(profileTasks.dueDate, sql`now()`),
        lte(profileTasks.reminderTime, sql`now()`),
      ),
      with: {
        profile: true,
      },
    });
  } catch (error) {
    console.error("Error fetching pending tasks", error);
    return [] as ProfileTaskWithProfile[];
  } finally {
    client.release();
  }
}

export async function fetchOverdueTasks() {
  const client = await pool.connect();
  try {
    return await db.query.profileTasks.findMany({
      where: and(
        isNull(profileTasks.completedAt),
        isNotNull(profileTasks.reminderSentAt),
        lte(profileTasks.dueDate, sql`now()`),
      ),
      with: {
        profile: true,
      },
    });
  } catch (error) {
    console.error("Error fetching overdue tasks", error);
    return [];
  } finally {
    client.release();
  }
}

export async function sendReminderEmails(): Promise<ProfileTaskWithProfile[]> {
  const client = await pool.connect();

  try {
    return await db.transaction(async (tx) => {
      const updatedIds = await tx
        .update(profileTasks)
        .set({
          reminderSentAt: new Date(),
        })
        .where(
          and(
            isNull(profileTasks.completedAt),
            isNull(profileTasks.reminderSentAt),
            gt(profileTasks.dueDate, sql`now()`),
            lte(profileTasks.reminderTime, sql`now()`),
          ),
        )
        .returning({ id: profileTasks.id });

      const pendingTasks = await tx.query.profileTasks.findMany({
        where: inArray(
          profileTasks.id,
          updatedIds.map((task) => task.id),
        ),
        with: {
          profile: true,
        },
      });

      pendingTasks.forEach(async (task) => {
        await sendEmail({
          from: "Equipo de Glitter <no-reply@festivalglitter.art>",
          to: [task.profile.email],
          subject: "Completa tu perfil para participar de nuestros eventos",
          react: ProfileCompletionReminderTemplate({
            task,
          }) as React.ReactElement,
        });
      });

      return pendingTasks;
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
        ),
        with: {
          profile: true,
        },
      });

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
          from: "Equipo de Glitter <no-reply@festivalglitter.art>",
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
