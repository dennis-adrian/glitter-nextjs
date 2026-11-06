import Link from "next/link";

import { CheckIcon, ChevronRightIcon } from "lucide-react";

import HomeTasksMore from "@/app/components/home/home-tasks-more";

import { HubPanel, HubSection } from "@/app/components/participations/hub/hub-section";
import {
  formatTaskDue,
  isTaskUrgent,
  type HomeTask,
} from "@/app/lib/home/tasks";
import { cn } from "@/app/lib/utils";

/** How many tasks show before the rest fold under "Ver N más". */
const VISIBLE_TASKS = 3;

function TaskRow({ task, now }: { task: HomeTask; now: Date }) {
  const urgent = isTaskUrgent(task, now);
  const detail = task.due ? formatTaskDue(task.due, now) : task.note;

  return (
    <li className="border-b border-brand-border last:border-b-0">
      <Link
        href={task.href}
        className="flex min-h-11 items-center gap-3 py-2 hover:text-brand-primary"
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-5 shrink-0 rounded-full border-2",
            urgent ? "border-red-400" : "border-brand-lavender",
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-brand-ink">
            {task.label}
          </span>
          {detail ? (
            <span
              className={cn(
                "truncate text-xs",
                urgent
                  ? "text-red-700 dark:text-red-300"
                  : "text-brand-neutral",
              )}
            >
              {detail}
            </span>
          ) : null}
        </span>
        <ChevronRightIcon
          className="size-4 shrink-0 text-brand-neutral"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

/**
 * Everything this person owes Glitter right now, from anywhere in the app.
 * Always there: with nothing to do it says so.
 */
export default function HomeTasks({
  tasks,
  now = new Date(),
}: {
  tasks: readonly HomeTask[];
  now?: Date;
}) {
  const visible = tasks.slice(0, VISIBLE_TASKS);
  const rest = tasks.slice(VISIBLE_TASKS);

  return (
    <HubSection title="Pendientes">
      {tasks.length === 0 ? (
        <HubPanel className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          >
            <CheckIcon className="size-3.5" />
          </span>
          <span className="text-sm text-brand-ink">No tenés nada pendiente</span>
        </HubPanel>
      ) : (
        <HubPanel className="px-4 py-1">
          <ul>
            {visible.map((task) => (
              <TaskRow key={task.key} task={task} now={now} />
            ))}
          </ul>
          {rest.length > 0 ? (
            <HomeTasksMore count={rest.length}>
              <ul className="border-t border-brand-border">
                {rest.map((task) => (
                  <TaskRow key={task.key} task={task} now={now} />
                ))}
              </ul>
            </HomeTasksMore>
          ) : null}
        </HubPanel>
      )}
    </HubSection>
  );
}
