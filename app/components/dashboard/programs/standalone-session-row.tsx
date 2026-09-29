import { DateTime } from "luxon";
import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { formatDisplayDate } from "@/app/lib/formatters";
import {
  SESSION_TYPE_LABELS,
  type ProgramSession,
} from "@/app/lib/programs/definitions";
import { sessionAdminPath } from "@/app/lib/programs/paths";

type Props = {
  session: Pick<
    ProgramSession,
    "id" | "programId" | "title" | "type" | "status"
  >;
  /** Start of the soonest occurrence that has not ended, if any. */
  nextStartsAt: Date | null;
};

/** One standalone session in the admin list. */
export default function StandaloneSessionRow({ session, nextStartsAt }: Props) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
      <div className="min-w-0 space-y-1">
        <Link
          href={sessionAdminPath(session)}
          className="truncate font-medium hover:underline"
        >
          {session.title}
        </Link>
        <p className="text-xs text-muted-foreground">
          {SESSION_TYPE_LABELS[session.type]} ·{" "}
          {nextStartsAt
            ? formatDisplayDate(nextStartsAt, DateTime.DATETIME_MED)
            : "Sin horarios próximos"}
        </p>
      </div>
      <Badge variant={session.status === "published" ? "green" : "outline"}>
        {session.status === "published" ? "Publicada" : "Borrador"}
      </Badge>
    </li>
  );
}
