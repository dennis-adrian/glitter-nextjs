import { CollaboratorAttendanceLog } from "@/app/lib/collaborators/definitions";

export function getArrivalTimeByFestivalDate(
  attendanceLogs: CollaboratorAttendanceLog[],
  festivalDateId: number,
) {
  const arrivalLog = attendanceLogs.find(
    (log) => log.festivalDateId === festivalDateId,
  );
  if (!arrivalLog) return null;
  return arrivalLog.arrivedAt;
}
