import CheckInAgendaCard from "@/app/components/dashboard/programs/checkin/checkin-agenda-card";
import type { CheckInAgendaEntry } from "@/app/lib/programs/occurrence-queries";

type Props = {
  title: string;
  entries: CheckInAgendaEntry[];
  /** Shown instead of the list when the group is empty. */
  emptyMessage?: string;
  showDate: boolean;
};

/** One heading and the doors under it. Renders nothing when empty and unexplained. */
export default function CheckInAgendaSection({
  title,
  entries,
  emptyMessage,
  showDate,
}: Props) {
  if (entries.length === 0 && !emptyMessage) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <CheckInAgendaCard
              key={entry.occurrenceId}
              entry={entry}
              showDate={showDate}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
