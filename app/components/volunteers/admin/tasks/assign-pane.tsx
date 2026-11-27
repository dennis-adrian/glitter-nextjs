"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";

import AssignShiftList, {
  AssignModeNav,
} from "@/app/components/volunteers/admin/tasks/assign-shift-list";
import { cn } from "@/app/lib/utils";
import type {
  VolunteerTaskCall,
  VolunteerTaskShift,
} from "@/app/lib/volunteers/admin-task-queries";

/**
 * Asignar by shift, below the tasks' header: "Por turno | Por persona", the
 * shift list and, beside it from lg, the open shift (`children`). Kept by its
 * layout across the shifts opened from the list, so picking one loads only
 * that shift. The open shift comes from the URL, else `firstId` (the index
 * opens the shift missing the most people). On phones the list is the index
 * and a shift has the whole screen.
 */
export function AssignByShiftPane({
  festivalId,
  shifts,
  roles,
  withoutShifts,
  firstId,
  children,
}: {
  festivalId: number;
  shifts: VolunteerTaskShift[];
  roles: VolunteerTaskCall["roles"];
  /** Accepted people without shifts, for "Por persona"'s badge. */
  withoutShifts: number;
  firstId?: number;
  children: ReactNode;
}) {
  const shiftId = useParams<{ shiftId?: string }>()?.shiftId;
  const openId = shiftId === undefined ? firstId : Number(shiftId);
  const listOnPhone = shiftId === undefined;

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
      <aside
        className={cn(
          "flex min-w-0 flex-col gap-3.5 lg:w-95 lg:shrink-0 lg:gap-4",
          !listOnPhone && "max-lg:hidden",
        )}
      >
        <AssignModeNav
          festivalId={festivalId}
          mode="turno"
          withoutShifts={withoutShifts}
        />
        <AssignShiftList
          festivalId={festivalId}
          shifts={shifts}
          roles={roles}
          selectedId={openId}
        />
      </aside>
      <div className={cn("min-w-0 flex-1", listOnPhone && "max-lg:hidden")}>
        {children}
      </div>
    </div>
  );
}
