import type { HubPendingItem } from "@/app/lib/participations/hub-status";
import { formatDisplayDate } from "@/app/lib/formatters";

/**
 * Inicio's "Pendientes": everything this person owes Glitter right now, from
 * any part of the app. Each builder takes data the page already has and
 * returns only open, actionable items; waiting on the team is not a task.
 * Kept free of data fetching so each rule is tested on its own.
 */

export type HomeTask = {
  key: string;
  label: string;
  /** Where to go to do it. */
  href: string;
  /** A deadline, when the data has one. */
  due?: Date | null;
  /** A short line under the label when there is no deadline: "0 de 4". */
  note?: string;
  /** Blocking, whatever the deadline: a debt, for one. */
  urgent?: boolean;
};

/** A deadline closer than this turns the task red and lifts it up the list. */
const SOON_MS = 48 * 60 * 60 * 1000;

/**
 * The participation's open steps that have somewhere to go. Done steps and
 * steps that only wait (a review in progress, reservations not open yet) stay
 * in the hub's own list.
 */
export function festivalTasks(
  items: readonly HubPendingItem[],
  {
    standLabel = null,
    invoiceDueAt = null,
  }: { standLabel?: string | null; invoiceDueAt?: Date | null } = {},
): HomeTask[] {
  return items
    .filter((item) => !item.done && item.href)
    .map((item) => {
      const href = item.href as string;
      if (item.key === "payment") {
        return {
          key: "festival-payment",
          label: standLabel
            ? `Pagar tu reserva del ${standLabel}`
            : "Pagar tu reserva",
          href,
          due: invoiceDueAt,
        };
      }
      return {
        key: `festival-${item.key}`,
        label: item.label,
        href,
        note: item.meta,
      };
    });
}

export type ActivityProofTask = {
  activityId: number;
  activityName: string;
  /** What is missing, as the activity card says it. */
  pendingLabel: string;
  deadline: Date | null;
};

/** Stand images an activity still needs from this participant. */
export function activityTasks(
  pending: readonly ActivityProofTask[],
  href: string,
): HomeTask[] {
  return pending.map((activity) => ({
    key: `activity-${activity.activityId}`,
    label: `${activity.activityName}: ${activity.pendingLabel.toLowerCase()}`,
    href,
    due: activity.deadline,
  }));
}

/** Store orders waiting for their payment. */
export function orderTasks(
  orders: readonly { id: number; paymentDueDate: Date }[],
): HomeTask[] {
  return orders.map((order) => ({
    key: `order-${order.id}`,
    label: `Pagar tu pedido #${order.id}`,
    href: `/orders/${order.id}/payment`,
    due: order.paymentDueDate,
  }));
}

/** A negative credit balance blocks reserving until it is settled. */
export function creditTasks(debt: number): HomeTask[] {
  if (debt <= 0) return [];
  return [
    {
      key: "credit-debt",
      label: "Regularizar tu saldo de créditos",
      href: "/my_credits",
      note: "Hasta regularizarlo no podés reservar",
      urgent: true,
    },
  ];
}

export type ProfileGaps = {
  /** No picture, or the sign-up placeholder. */
  photo: boolean;
  bio: boolean;
  socials: boolean;
  /** Any other required field, or no subcategory. */
  details: boolean;
};

/**
 * What the profile review will look at and is still missing, own photo first.
 * A rejected profile also has to correct what the team pointed out.
 */
export function profileTasks(
  gaps: ProfileGaps,
  { rejected = false }: { rejected?: boolean } = {},
): HomeTask[] {
  const href = "/my_profile";
  const tasks: HomeTask[] = [];
  if (rejected) {
    tasks.push({
      key: "profile-fix",
      label: "Corregir lo que señaló el equipo",
      href,
      note: "El motivo está en el correo que te enviamos",
    });
  }
  if (gaps.photo) {
    tasks.push({ key: "profile-photo", label: "Subir una foto tuya", href });
  }
  if (gaps.bio) {
    tasks.push({ key: "profile-bio", label: "Escribir tu bio", href });
  }
  if (gaps.socials) {
    tasks.push({ key: "profile-socials", label: "Agregar tus redes", href });
  }
  if (gaps.details) {
    tasks.push({
      key: "profile-details",
      label: "Completar tus datos personales",
      href,
    });
  }
  return tasks;
}

export function isTaskUrgent(task: HomeTask, now: Date): boolean {
  if (task.urgent) return true;
  if (!task.due) return false;
  return task.due.getTime() - now.getTime() < SOON_MS;
}

/**
 * Urgent first, then by deadline, then the rest in the order they came in
 * (the order things come up in a participation).
 */
export function sortHomeTasks(
  tasks: readonly HomeTask[],
  now: Date,
): HomeTask[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const urgent =
        Number(isTaskUrgent(b.task, now)) - Number(isTaskUrgent(a.task, now));
      if (urgent !== 0) return urgent;
      const aDue = a.task.due?.getTime() ?? Infinity;
      const bDue = b.task.due?.getTime() ?? Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return a.index - b.index;
    })
    .map(({ task }) => task);
}

/** "hasta el 5 nov, 6:00 PM", or "vencido" once it has passed. */
export function formatTaskDue(due: Date, now: Date): string {
  if (due.getTime() < now.getTime()) return "vencido";
  return `hasta el ${formatDisplayDate(due, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
