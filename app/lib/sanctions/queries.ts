import {
  and,
  desc,
  eq,
  exists,
  ilike,
  ne,
  notExists,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";

import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivals,
  infractions,
  infractionTypes,
  sanctionEvents,
  sanctionInfractions,
  sanctions,
} from "@/db/schema";

export type EligibleInfractionOption = {
  id: number;
  status: (typeof infractions.$inferSelect)["status"];
  description: string | null;
  festivalId: number | null;
  createdAt: Date;
  type: {
    id: number;
    label: string;
    severity: (typeof infractionTypes.$inferSelect)["severity"];
  };
  festival: { id: number; name: string } | null;
};

export type SanctionDetail = typeof sanctions.$inferSelect & {
  user: {
    id: number;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  createdBy: {
    id: number;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  approvedBy: {
    id: number;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  revokedBy: {
    id: number;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  sanctionInfractions: Array<{
    sanctionId: number;
    infractionId: number;
    linkedAt: Date;
    infraction: {
      id: number;
      status: (typeof infractions.$inferSelect)["status"];
      description: string | null;
      createdAt: Date;
      type: {
        id: number;
        label: string;
        severity: (typeof infractionTypes.$inferSelect)["severity"];
      };
      festival: { id: number; name: string } | null;
    };
  }>;
  events: Array<
    typeof sanctionEvents.$inferSelect & {
      actor: {
        id: number;
        displayName: string | null;
        firstName: string | null;
        lastName: string | null;
        email: string;
      } | null;
    }
  >;
};

const userColumns = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

export async function fetchSanctionDetail(
  sanctionId: number,
): Promise<SanctionDetail | null> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return null;

  const sanction = await db.query.sanctions.findFirst({
    where: eq(sanctions.id, sanctionId),
    with: {
      user: { columns: userColumns },
      createdBy: { columns: userColumns },
      approvedBy: { columns: userColumns },
      revokedBy: { columns: userColumns },
      sanctionInfractions: {
        with: {
          infraction: {
            columns: {
              id: true,
              status: true,
              description: true,
              createdAt: true,
            },
            with: {
              type: {
                columns: { id: true, label: true, severity: true },
              },
              festival: {
                columns: { id: true, name: true },
              },
            },
          },
        },
      },
      events: {
        orderBy: (events, { desc: d }) => [d(events.createdAt)],
        with: {
          actor: { columns: userColumns },
        },
      },
    },
  });

  return (sanction as SanctionDetail | undefined) ?? null;
}

export async function fetchEligibleInfractionsForSanction(input: {
  userId: number;
  excludeInfractionIds?: number[];
  query?: string;
  limit?: number;
}): Promise<EligibleInfractionOption[]> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return [];

  const exclude = input.excludeInfractionIds ?? [];
  const conditions: SQL[] = [
    eq(infractions.userId, input.userId),
    ne(infractions.status, "voided"),
    notExists(
      db
        .select({ id: sanctionInfractions.infractionId })
        .from(sanctionInfractions)
        .where(eq(sanctionInfractions.infractionId, infractions.id)),
    ),
  ];

  if (exclude.length > 0) {
    conditions.push(notInArray(infractions.id, exclude));
  }

  const query = input.query?.trim();
  if (query) {
    const pattern = `%${query}%`;
    const textCondition = or(
      ilike(infractions.description, pattern),
      exists(
        db
          .select({ id: infractionTypes.id })
          .from(infractionTypes)
          .where(
            and(
              eq(infractionTypes.id, infractions.typeId),
              or(
                ilike(infractionTypes.label, pattern),
                ilike(infractionTypes.description, pattern),
              ),
            ),
          ),
      ),
      exists(
        db
          .select({ id: festivals.id })
          .from(festivals)
          .where(
            and(
              eq(festivals.id, infractions.festivalId),
              ilike(festivals.name, pattern),
            ),
          ),
      ),
    );
    if (textCondition) conditions.push(textCondition);
  }

  return db.query.infractions.findMany({
    where: and(...conditions),
    columns: {
      id: true,
      status: true,
      description: true,
      festivalId: true,
      createdAt: true,
    },
    with: {
      type: {
        columns: { id: true, label: true, severity: true },
      },
      festival: {
        columns: { id: true, name: true },
      },
    },
    orderBy: [desc(infractions.createdAt)],
    limit: input.limit ?? 15,
  });
}
