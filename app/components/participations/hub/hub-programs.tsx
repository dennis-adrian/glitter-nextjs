import Link from "next/link";

import { ChevronRightIcon } from "lucide-react";

import ProgramDateStamp from "@/app/components/programs/program-date-stamp";
import { HubPanel } from "@/app/components/participations/hub/hub-section";
import type { ParticipationHub } from "@/app/lib/participations/hub";
import { SESSION_TYPE_LABELS } from "@/app/lib/programs/definitions";
import { sessionPath } from "@/app/lib/programs/paths";

/**
 * The talks and workshops that belong to this festival and are still ahead.
 * Each opens its own page, where enrolling happens.
 */
export default function HubPrograms({
  sessions,
}: {
  sessions: ParticipationHub["sessions"];
}) {
  if (sessions.length === 0) return null;

  return (
    <HubPanel className="px-4 py-1">
      <ul>
        {sessions.map(({ session, nextOccurrence }) => (
          <li
            key={session.id}
            className="border-b border-brand-border last:border-b-0"
          >
            <Link
              href={sessionPath(session)}
              className="flex items-center gap-3 py-3 hover:text-brand-primary"
            >
              <ProgramDateStamp start={nextOccurrence.startsAt} third="time" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-brand-ink">
                  {session.title}
                </span>
                <span className="text-xs text-brand-neutral">
                  {SESSION_TYPE_LABELS[session.type]}
                </span>
              </span>
              <ChevronRightIcon
                className="size-4 shrink-0 text-brand-neutral"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </HubPanel>
  );
}
