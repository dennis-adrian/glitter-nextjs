import StandaloneSessionRow from "@/app/components/dashboard/programs/standalone-session-row";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { nextUpcomingOccurrence } from "@/app/lib/programs/catalogue";
import type { fetchStandaloneSessionsForAdmin } from "@/app/lib/programs/data";

type StandaloneSession = Awaited<
  ReturnType<typeof fetchStandaloneSessionsForAdmin>
>[number];

type Entry = { session: StandaloneSession; nextStartsAt: Date | null };

type Group = { festivalId: number | null; label: string; entries: Entry[] };

type Props = {
  sessions: StandaloneSession[];
  /** Pinned by the page, so every row is judged against the same instant. */
  now: Date;
};

/**
 * Talks and workshops that belong to no program, grouped by the festival they
 * are part of. Newer festivals first, "Sin festival" last; within a group, the
 * soonest upcoming first and anything with nothing ahead after it.
 */
export default function StandaloneSessionsSection({ sessions, now }: Props) {
  const groups = groupByFestival(sessions, now);

  return (
    <section className="flex flex-col gap-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Charlas y talleres sueltos</h2>
        <p className="text-sm text-muted-foreground">
          Sesiones que no pertenecen a ningún programa. Se venden por su cuenta
          y no aceptan códigos promocionales.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-muted-foreground">
          Todavía no hay charlas ni talleres sueltos.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.festivalId ?? "none"}>
              <CardHeader>
                <CardTitle className="text-base">{group.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {group.entries.map(({ session, nextStartsAt }) => (
                    <StandaloneSessionRow
                      key={session.id}
                      session={session}
                      nextStartsAt={nextStartsAt}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function groupByFestival(sessions: StandaloneSession[], now: Date): Group[] {
  const byFestival = new Map<number | null, Group>();

  for (const session of sessions) {
    const festivalId = session.festival?.id ?? null;
    let group = byFestival.get(festivalId);
    if (!group) {
      group = {
        festivalId,
        label: session.festival?.name ?? "Sin festival",
        entries: [],
      };
      byFestival.set(festivalId, group);
    }

    group.entries.push({
      session,
      nextStartsAt:
        nextUpcomingOccurrence(session.occurrences, now)?.startsAt ?? null,
    });
  }

  for (const group of byFestival.values()) {
    // Stable, so sessions with nothing ahead keep the query's newest-first.
    group.entries.sort((a, b) => {
      if (a.nextStartsAt === null || b.nextStartsAt === null) {
        return (
          Number(a.nextStartsAt === null) - Number(b.nextStartsAt === null)
        );
      }
      return a.nextStartsAt.getTime() - b.nextStartsAt.getTime();
    });
  }

  return [...byFestival.values()].sort((a, b) => {
    if (a.festivalId === null || b.festivalId === null) {
      return Number(a.festivalId === null) - Number(b.festivalId === null);
    }
    return b.festivalId - a.festivalId;
  });
}
