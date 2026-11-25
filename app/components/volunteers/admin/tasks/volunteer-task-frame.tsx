"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useState,
} from "react";

import {
  type VolunteerTask,
  VolunteerTaskBar,
} from "@/app/components/volunteers/admin/tasks/task-header";
import { VolunteerTaskSkeleton } from "@/app/components/volunteers/admin/tasks/task-skeletons";
import { cn } from "@/app/lib/utils";
import { volunteerAdminPath } from "@/app/lib/volunteers/admin-definitions";

import { pageFrame } from "@/app/components/volunteers/admin/tasks/task-frame";

/**
 * Where a path under Revisar and Asignar is: which task its switch shows,
 * and whether it is one item's screen (an application, a shift), which has
 * the whole screen on phones, header included.
 */
export function volunteerTaskRoute(
  pathname: string,
  festivalId: number,
): { task: VolunteerTask; item: boolean } {
  const base = volunteerAdminPath(festivalId);
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const [first] = rest.split("/").filter(Boolean);
  if (first === "asignar") return { task: "asignar", item: false };
  if (first === "shifts") return { task: "asignar", item: true };
  return { task: "revisar", item: first !== undefined };
}

type SoloMemory = { set: (solo: boolean) => void; get: () => boolean };

function createSoloMemory(): SoloMemory {
  let solo = false;
  return {
    set: (value) => {
      solo = value;
    },
    get: () => solo,
  };
}

/** Whether the screen on show takes the whole page, for the next loading. */
const SoloMemory = createContext<SoloMemory | null>(null);

/**
 * Marks a screen under the tasks' frame that takes the whole page (an
 * accepted person, "Turnos que puede"): the header and the lists step aside
 * and the frame around it lays nothing out.
 */
export function VolunteerSoloScreen({ children }: { children: ReactNode }) {
  const memory = useContext(SoloMemory);
  useLayoutEffect(() => {
    memory?.set(true);
    return () => memory?.set(false);
  }, [memory]);
  return (
    <div data-volunteer-solo="" className="contents">
      {children}
    </div>
  );
}

type TaskSummary = {
  task: VolunteerTask;
  pending: number;
  places: number;
  strip: ReactNode;
};

/** Where a task's content reports the counts it loaded with. */
const TaskSummaryContext = createContext<
  ((summary: TaskSummary) => void) | null
>(null);

/**
 * Rendered by each task's content with the call it loaded: the header is
 * kept across tasks and does not reload, so the switch's counts and the
 * strip follow the content, never older than what is shown below them.
 */
export function VolunteerTaskSummary({
  task,
  pending,
  places,
  strip,
}: TaskSummary) {
  const publish = useContext(TaskSummaryContext);
  useLayoutEffect(() => {
    publish?.({ task, pending, places, strip });
  }, [publish, task, pending, places, strip]);
  return null;
}

/** Whole-page screens step out of the frame: no box, no header, no list. */
export const soloContents =
  "group-has-[[data-volunteer-solo]]/volunteer-tasks:contents";
export const soloHidden =
  "group-has-[[data-volunteer-solo]]/volunteer-tasks:hidden";

/** Links between accepted people carry where they came from. */
const PERSON_PARAMS = ["grupo", "desde", "asignar"];

/**
 * Loading under the tasks' frame keeps the shape of the screen it replaces
 * or is headed to: `children` below the header, or a whole-page screen (an
 * accepted person and the next one) without it.
 */
export function VolunteerTaskLoading({ children }: { children: ReactNode }) {
  const memory = useContext(SoloMemory);
  const searchParams = useSearchParams();
  const solo =
    memory?.get() || PERSON_PARAMS.some((param) => searchParams.has(param));
  return solo ? (
    <VolunteerSoloScreen>
      <VolunteerTaskSkeleton />
    </VolunteerSoloScreen>
  ) : (
    children
  );
}

/**
 * The frame of Revisar and Asignar, kept by their layout across both tasks
 * and every screen in them: `top` (title, settings, export) never reloads,
 * and the switch and the strip follow the URL at once, with the counts the
 * newest content reported (`VolunteerTaskSummary`). Only `children`, the
 * task's own content, loads. On phones an item's screen (an application, a
 * shift) has the whole screen, without the header.
 */
export function VolunteerTaskFrame({
  festivalId,
  top,
  pending,
  places,
  strips,
  children,
}: {
  festivalId: number;
  top: ReactNode;
  /** The switch's counts until a task's content reports its own. */
  pending: number;
  places: number;
  /** The grey line under the switch, per task, likewise. */
  strips: Record<VolunteerTask, ReactNode>;
  children: ReactNode;
}) {
  const { task, item } = volunteerTaskRoute(usePathname(), festivalId);
  const [memory] = useState(createSoloMemory);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  // Counts belong to the call, whichever task reported them; a strip only to
  // its own task.
  const strip = summary?.task === task ? summary.strip : strips[task];

  return (
    <SoloMemory.Provider value={memory}>
      <TaskSummaryContext.Provider value={setSummary}>
        <div
          className={cn(
            pageFrame,
            "group/volunteer-tasks",
            item && "max-lg:p-0 max-lg:pb-0",
            "has-[[data-volunteer-solo]]:contents",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-col gap-3.5 lg:gap-4",
              item && "max-lg:hidden",
              soloHidden,
            )}
          >
            {top}
            <VolunteerTaskBar
              festivalId={festivalId}
              task={task}
              pending={summary?.pending ?? pending}
              places={summary?.places ?? places}
              strip={strip}
            />
          </div>
          {children}
        </div>
      </TaskSummaryContext.Provider>
    </SoloMemory.Provider>
  );
}
