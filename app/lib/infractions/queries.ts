import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  notExists,
  or,
  type SQL,
} from "drizzle-orm";

import type { InfractionSearchParams } from "@/app/dashboard/infractions/schemas";
import type {
  InfractionBase,
  InfractionStatus,
} from "@/app/lib/infractions/definitions";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivals,
  infractionEvidence,
  infractionEvents,
  infractionNotes,
  infractions,
  infractionTypes,
  sanctions,
  users,
} from "@/db/schema";
import { DateTime } from "luxon";

export type InfractionListItem = InfractionBase & {
  user: {
    id: number;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  type: {
    id: number;
    label: string;
    severity: (typeof infractionTypes.$inferSelect)["severity"];
    description: string | null;
  };
  festival: {
    id: number;
    name: string;
    festivalType: (typeof festivals.$inferSelect)["festivalType"];
  } | null;
  sanctions: {
    id: number;
    type: (typeof sanctions.$inferSelect)["type"];
    active: boolean;
  }[];
};

export type InfractionDetail = InfractionListItem & {
  events: Array<
    typeof infractionEvents.$inferSelect & {
      actor: {
        id: number;
        displayName: string | null;
        firstName: string | null;
        lastName: string | null;
        email: string;
      } | null;
    }
  >;
  notes: Array<
    typeof infractionNotes.$inferSelect & {
      author: {
        id: number;
        displayName: string | null;
        firstName: string | null;
        lastName: string | null;
        email: string;
      };
    }
  >;
  evidence: Array<
    typeof infractionEvidence.$inferSelect & {
      addedBy: {
        id: number;
        displayName: string | null;
        firstName: string | null;
        lastName: string | null;
        email: string;
      };
    }
  >;
};

function buildInfractionConditions(
  filters: InfractionSearchParams,
): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.userId) {
    conditions.push(eq(infractions.userId, filters.userId));
  }

  if (filters.festivalId === "none") {
    conditions.push(isNull(infractions.festivalId));
  } else if (typeof filters.festivalId === "number") {
    conditions.push(eq(infractions.festivalId, filters.festivalId));
  }

  if (filters.typeId) {
    conditions.push(eq(infractions.typeId, filters.typeId));
  }

  if (filters.status?.length) {
    conditions.push(inArray(infractions.status, filters.status));
  }

  if (filters.userGaveNotice != null) {
    conditions.push(eq(infractions.userGaveNotice, filters.userGaveNotice));
  }

  if (filters.createdFrom) {
    conditions.push(
      gte(
        infractions.createdAt,
        DateTime.fromISO(filters.createdFrom, { zone: STORE_TIMEZONE })
          .startOf("day")
          .toJSDate(),
      ),
    );
  }

  if (filters.createdTo) {
    conditions.push(
      lte(
        infractions.createdAt,
        DateTime.fromISO(filters.createdTo, { zone: STORE_TIMEZONE })
          .endOf("day")
          .toJSDate(),
      ),
    );
  }

  if (filters.resolvedFrom) {
    conditions.push(
      gte(
        infractions.resolvedAt,
        DateTime.fromISO(filters.resolvedFrom, { zone: STORE_TIMEZONE })
          .startOf("day")
          .toJSDate(),
      ),
    );
  }

  if (filters.severity?.length) {
    conditions.push(
      exists(
        db
          .select({ id: infractionTypes.id })
          .from(infractionTypes)
          .where(
            and(
              eq(infractionTypes.id, infractions.typeId),
              inArray(infractionTypes.severity, filters.severity),
            ),
          ),
      ),
    );
  }

  if (filters.festivalType) {
    conditions.push(
      exists(
        db
          .select({ id: festivals.id })
          .from(festivals)
          .where(
            and(
              eq(festivals.id, infractions.festivalId),
              eq(festivals.festivalType, filters.festivalType),
            ),
          ),
      ),
    );
  }

  if (filters.hasSanction === true) {
    conditions.push(
      exists(
        db
          .select({ id: sanctions.id })
          .from(sanctions)
          .where(eq(sanctions.infractionId, infractions.id)),
      ),
    );
  } else if (filters.hasSanction === false) {
    conditions.push(
      notExists(
        db
          .select({ id: sanctions.id })
          .from(sanctions)
          .where(eq(sanctions.infractionId, infractions.id)),
      ),
    );
  }

  if (filters.sanctionStatus) {
    const active = filters.sanctionStatus === "active";
    conditions.push(
      exists(
        db
          .select({ id: sanctions.id })
          .from(sanctions)
          .where(
            and(
              eq(sanctions.infractionId, infractions.id),
              eq(sanctions.active, active),
            ),
          ),
      ),
    );
  }

  const query = filters.query.trim();
  if (query) {
    const pattern = `%${query}%`;
    const textCondition = or(
      ilike(infractions.description, pattern),
      exists(
        db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, infractions.userId),
              or(
                ilike(users.displayName, pattern),
                ilike(users.firstName, pattern),
                ilike(users.lastName, pattern),
                ilike(users.email, pattern),
              ),
            ),
          ),
      ),
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

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildOrderBy(filters: InfractionSearchParams) {
  const direction = filters.direction === "asc" ? asc : desc;

  if (filters.sort === "status") {
    return [direction(infractions.status), desc(infractions.id)];
  }

  return [direction(infractions.createdAt), desc(infractions.id)];
}

export async function fetchInfractionsPage(filters: InfractionSearchParams) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return { items: [] as InfractionListItem[], total: 0 };
  }

  const where = buildInfractionConditions(filters);

  const [totalRow] = await db
    .select({ total: count() })
    .from(infractions)
    .where(where);

  const rows = await db.query.infractions.findMany({
    where,
    with: {
      user: {
        columns: {
          id: true,
          displayName: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      type: {
        columns: {
          id: true,
          label: true,
          severity: true,
          description: true,
        },
      },
      festival: {
        columns: {
          id: true,
          name: true,
          festivalType: true,
        },
      },
      sanctions: {
        columns: {
          id: true,
          type: true,
          active: true,
        },
      },
    },
    orderBy: buildOrderBy(filters),
    limit: filters.limit,
    offset: filters.offset,
  });

  return {
    items: rows as InfractionListItem[],
    total: totalRow?.total ?? 0,
  };
}

export async function fetchInfractionDetail(
  infractionId: number,
): Promise<InfractionDetail | null> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return null;

  const infraction = await db.query.infractions.findFirst({
    where: eq(infractions.id, infractionId),
    with: {
      user: {
        columns: {
          id: true,
          displayName: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      type: {
        columns: {
          id: true,
          label: true,
          severity: true,
          description: true,
        },
      },
      festival: {
        columns: {
          id: true,
          name: true,
          festivalType: true,
        },
      },
      sanctions: {
        columns: {
          id: true,
          type: true,
          active: true,
        },
      },
      events: {
        orderBy: (events, { desc: d }) => [d(events.createdAt)],
        with: {
          actor: {
            columns: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
      notes: {
        orderBy: (notes, { desc: d }) => [d(notes.createdAt)],
        with: {
          author: {
            columns: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
      evidence: {
        orderBy: (items, { desc: d }) => [d(items.createdAt)],
        with: {
          addedBy: {
            columns: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  return (infraction as InfractionDetail | undefined) ?? null;
}

export async function fetchParticipantOtherInfractions(input: {
  userId: number;
  excludeInfractionId: number;
  limit?: number;
}) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return [];

  return db.query.infractions.findMany({
    where: and(
      eq(infractions.userId, input.userId),
      ne(infractions.id, input.excludeInfractionId),
    ),
    columns: {
      id: true,
      status: true,
      createdAt: true,
      festivalId: true,
    },
    with: {
      type: {
        columns: { label: true, severity: true },
      },
      festival: {
        columns: { name: true },
      },
    },
    orderBy: [desc(infractions.createdAt)],
    limit: input.limit ?? 10,
  });
}

export async function fetchFestivalsForInfractionFilters() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return [];

  return db.query.festivals.findMany({
    columns: {
      id: true,
      name: true,
      festivalType: true,
      status: true,
    },
    orderBy: [desc(festivals.createdAt)],
  });
}

export type { InfractionStatus };
