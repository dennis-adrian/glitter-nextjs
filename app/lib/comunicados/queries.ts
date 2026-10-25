import "server-only";

import { count, desc, eq, inArray, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  type ComunicadoAudience,
  type ComunicadoMissedReason,
  type ComunicadoStatus,
  EMPTY_COMUNICADO_AUDIENCE,
  parseStoredComunicadoAudience,
} from "@/app/lib/comunicados/definitions";
import {
  confirmadosListName,
  type DistributionListKind,
  type Paged,
} from "@/app/lib/distribution_lists/definitions";
import { comunicadoSkipReasonSql } from "@/app/lib/participants/recipient-eligibility-queries";
import { requireAdmin } from "@/app/lib/users/helpers";
import { userSearchCondition } from "@/app/lib/users/search-condition";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";
import {
  comunicadoRevisions,
  comunicados,
  distributionLists,
  festivals,
  notificationCampaigns,
  users,
} from "@/db/schema";
import { serverEnv } from "@/env";

/**
 * The Comunicados pages' reads (docs/IMPLEMENTATION-comunicados.md G2–G4).
 * Global admins only: every query checks inside, and answers anyone else
 * with nothing.
 */

export const COMUNICADO_LIST_PAGE_SIZE = 25;
const PEOPLE_SEARCH_LIMIT = 8;

export type ComunicadoTab = "drafts" | "scheduled" | "sent";

const TAB_STATUS = {
  drafts: "draft",
  scheduled: "scheduled",
  sent: "sent",
} as const satisfies Record<ComunicadoTab, ComunicadoStatus>;

async function canRead() {
  return (await requireAdmin()) !== null;
}

function personName(
  row: {
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null,
) {
  if (!row) return null;
  return getUserName(row) || null;
}

/** How people are ordered: by the name the dashboard shows, then id. */
const nameOrder = sql`lower(coalesce(
  nullif(btrim(${users.displayName}), ''),
  nullif(btrim(concat_ws(' ', ${users.firstName}, ${users.lastName})), ''),
  ${users.email}
)), ${users.id}`;

/** "Borradores (2)" · "Programados (1)" · "Enviados". */
export async function fetchComunicadoTabs(): Promise<
  Record<ComunicadoTab, number>
> {
  if (!(await canRead())) return { drafts: 0, scheduled: 0, sent: 0 };
  const [row] = await db
    .select({
      drafts: sql<number>`count(*) FILTER (WHERE ${comunicados.status} = 'draft')::int`,
      scheduled: sql<number>`count(*) FILTER (WHERE ${comunicados.status} = 'scheduled')::int`,
      sent: sql<number>`count(*) FILTER (WHERE ${comunicados.status} = 'sent')::int`,
    })
    .from(comunicados);
  return {
    drafts: row?.drafts ?? 0,
    scheduled: row?.scheduled ?? 0,
    sent: row?.sent ?? 0,
  };
}

type AudienceNames = {
  festivals: Map<number, string>;
  lists: Map<number, string>;
};

/** Festival and list names for many stored audiences, in two queries. */
async function audienceNames(
  audiences: (ComunicadoAudience | null)[],
): Promise<AudienceNames> {
  const festivalIds = new Set<number>();
  const listIds = new Set<number>();
  for (const audience of audiences) {
    audience?.festivals.forEach((id) => festivalIds.add(id));
    audience?.lists.forEach((id) => listIds.add(id));
  }
  const [festivalRows, listRows] = await Promise.all([
    festivalIds.size > 0
      ? db
          .select({ id: festivals.id, name: festivals.name })
          .from(festivals)
          .where(inArray(festivals.id, [...festivalIds]))
      : [],
    listIds.size > 0
      ? db
          .select({ id: distributionLists.id, name: distributionLists.name })
          .from(distributionLists)
          .where(inArray(distributionLists.id, [...listIds]))
      : [],
  ]);
  return {
    festivals: new Map(festivalRows.map((row) => [row.id, row.name])),
    lists: new Map(listRows.map((row) => [row.id, row.name])),
  };
}

const listFormat = new Intl.ListFormat("es", {
  style: "long",
  type: "conjunction",
});

/**
 * "Para: Confirmados · Glitter Navidad 2026 y 3 personas", or null when the
 * audience is empty or no longer parses. A festival or list that no longer
 * exists is left out.
 */
export function comunicadoAudienceLabel(
  audience: ComunicadoAudience | null,
  names: AudienceNames,
): string | null {
  if (!audience) return null;
  const parts: string[] = [];
  for (const id of audience.festivals) {
    const name = names.festivals.get(id);
    if (name) parts.push(confirmadosListName(name));
  }
  for (const id of audience.lists) {
    const name = names.lists.get(id);
    if (name) parts.push(name);
  }
  const people = audience.people.length;
  if (people > 0) parts.push(people === 1 ? "1 persona" : `${people} personas`);
  return parts.length > 0 ? `Para: ${listFormat.format(parts)}` : null;
}

export type ComunicadoListRow = {
  id: number;
  /** As written; empty shows "Sin título". */
  title: string;
  status: ComunicadoStatus;
  essential: boolean;
  scheduledAt: Date | null;
  /** A release refused it: "No se envió" (E4). */
  scheduleMissedAt: Date | null;
  sentAt: Date | null;
  /** "Enviando…": its campaign is still processing. */
  sending: boolean;
  retractedAt: Date | null;
  /** The latest edit after sending; null until PR 7 edits exist. */
  editedAt: Date | null;
  updatedAt: Date;
  audienceLabel: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  sentByName: string | null;
};

const createdBy = alias(users, "created_by");
const updatedBy = alias(users, "updated_by");
const sentBy = alias(users, "sent_by");

function pageOf(page: number) {
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function pageCountOf(total: number) {
  return Math.max(1, Math.ceil(total / COMUNICADO_LIST_PAGE_SIZE));
}

/** One tab of the list, 25 at a time, newest activity first. */
export async function fetchComunicadoList(input: {
  tab: ComunicadoTab;
  page: number;
}): Promise<Paged<ComunicadoListRow>> {
  const requested = pageOf(input.page);
  if (!(await canRead())) {
    return { rows: [], total: 0, page: requested, pageCount: 1 };
  }
  const status = TAB_STATUS[input.tab];
  const [totalRow] = await db
    .select({ total: count() })
    .from(comunicados)
    .where(eq(comunicados.status, status));
  const total = totalRow?.total ?? 0;
  // Past the end (the last draft on a page was discarded): show the last page.
  const page = Math.min(requested, pageCountOf(total));

  const rows = await db
    .select({
      id: comunicados.id,
      title: comunicados.title,
      status: comunicados.status,
      essential: comunicados.essential,
      scheduledAt: comunicados.scheduledAt,
      scheduleMissedAt: comunicados.scheduleMissedAt,
      sentAt: comunicados.sentAt,
      retractedAt: comunicados.retractedAt,
      updatedAt: comunicados.updatedAt,
      audience: comunicados.audience,
      campaignStatus: notificationCampaigns.status,
      editedAt: sql<Date | null>`(
        SELECT ${max(comunicadoRevisions.createdAt)} FROM ${comunicadoRevisions}
        WHERE ${comunicadoRevisions.comunicadoId} = ${comunicados.id}
          AND ${comunicadoRevisions.revision} > 1
      )`.mapWith(comunicadoRevisions.createdAt),
      createdBy: {
        displayName: createdBy.displayName,
        firstName: createdBy.firstName,
        lastName: createdBy.lastName,
      },
      updatedBy: {
        displayName: updatedBy.displayName,
        firstName: updatedBy.firstName,
        lastName: updatedBy.lastName,
      },
      sentBy: {
        displayName: sentBy.displayName,
        firstName: sentBy.firstName,
        lastName: sentBy.lastName,
      },
    })
    .from(comunicados)
    .leftJoin(
      notificationCampaigns,
      eq(notificationCampaigns.id, comunicados.campaignId),
    )
    .leftJoin(createdBy, eq(createdBy.id, comunicados.createdByUserId))
    .leftJoin(updatedBy, eq(updatedBy.id, comunicados.updatedByUserId))
    .leftJoin(sentBy, eq(sentBy.id, comunicados.sentByUserId))
    .where(eq(comunicados.status, status))
    .orderBy(desc(comunicados.updatedAt), desc(comunicados.id))
    .limit(COMUNICADO_LIST_PAGE_SIZE)
    .offset((page - 1) * COMUNICADO_LIST_PAGE_SIZE);

  const audiences = rows.map((row) =>
    parseStoredComunicadoAudience(row.audience),
  );
  const names = await audienceNames(audiences);
  return {
    rows: rows.map((row, index) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      essential: row.essential,
      scheduledAt: row.scheduledAt,
      scheduleMissedAt: row.scheduleMissedAt,
      sentAt: row.sentAt,
      sending: row.campaignStatus === "processing",
      retractedAt: row.retractedAt,
      editedAt: row.editedAt,
      updatedAt: row.updatedAt,
      audienceLabel: comunicadoAudienceLabel(audiences[index]!, names),
      createdByName: personName(row.createdBy),
      updatedByName: personName(row.updatedBy),
      sentByName: personName(row.sentBy),
    })),
    total,
    page,
    pageCount: pageCountOf(total),
  };
}

export type ComposerPerson = {
  id: number;
  name: string;
  email: string;
  role: (typeof users.$inferSelect)["role"];
  imageUrl: string | null;
  /** The person-source rule (B5): the label, or null when they receive it. */
  skipReason: string | null;
};

export type ComposerComunicado = {
  id: number;
  status: ComunicadoStatus;
  version: number;
  title: string;
  doc: unknown[];
  actionLabel: string | null;
  actionPath: string | null;
  sendEmail: boolean;
  sendPush: boolean;
  /** Empty when the stored audience no longer parses (`audienceUnreadable`). */
  audience: ComunicadoAudience;
  audienceUnreadable: boolean;
  essential: boolean;
  essentialReason: string | null;
  scheduledAt: Date | null;
  scheduleMissedAt: Date | null;
  scheduleMissedReason: ComunicadoMissedReason | null;
  scheduleMissedDetail: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** The stored audience's sources, in its order, for the chips. */
  sources: {
    festivals: { id: number; name: string; label: string }[];
    lists: {
      id: number;
      name: string;
      kind: DistributionListKind;
      archived: boolean;
    }[];
    people: ComposerPerson[];
    /** Ids the audience still names that no longer exist. */
    missing: { festivals: number[]; lists: number[]; people: number[] };
  };
};

type PersonRow = {
  id: number;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  image_url: string | null;
  role: ComposerPerson["role"];
  reason: string | null;
};

/**
 * A person with the B5 verdict for someone picked by name. Raw SQL: the select
 * builder prints a lone table's columns bare, and the rule's pending-deletion
 * subquery would then read `"id"` as its own.
 */
const personColumns = sql`${users.id} AS id,
  ${users.displayName} AS display_name,
  ${users.firstName} AS first_name,
  ${users.lastName} AS last_name,
  ${users.email} AS email,
  ${users.imageUrl} AS image_url,
  ${users.role} AS role,
  ${comunicadoSkipReasonSql(
    { id: users.id, role: users.role, status: users.status },
    sql`'person'`,
    false,
  )} AS reason`;

function toComposerPerson(row: PersonRow): ComposerPerson {
  return {
    id: Number(row.id),
    name:
      getUserName({
        displayName: row.display_name,
        firstName: row.first_name,
        lastName: row.last_name,
      }) || row.email,
    email: row.email,
    role: row.role,
    imageUrl: row.image_url,
    skipReason: row.reason,
  };
}

/**
 * The full working copy for the composer, any status (a scheduled one opens
 * read-only), with the names behind its stored audience. Null when it does
 * not exist.
 */
export async function fetchComunicadoForComposer(
  id: number,
): Promise<ComposerComunicado | null> {
  if (!(await canRead())) return null;
  const [row] = await db
    .select()
    .from(comunicados)
    .where(eq(comunicados.id, id))
    .limit(1);
  if (!row) return null;

  const parsed = parseStoredComunicadoAudience(row.audience);
  const audience = parsed ?? EMPTY_COMUNICADO_AUDIENCE;
  const [festivalRows, listRows, peopleRows] = await Promise.all([
    audience.festivals.length > 0
      ? db
          .select({ id: festivals.id, name: festivals.name })
          .from(festivals)
          .where(inArray(festivals.id, audience.festivals))
      : [],
    audience.lists.length > 0
      ? db
          .select({
            id: distributionLists.id,
            name: distributionLists.name,
            kind: distributionLists.kind,
            archivedAt: distributionLists.archivedAt,
          })
          .from(distributionLists)
          .where(inArray(distributionLists.id, audience.lists))
      : [],
    audience.people.length > 0
      ? db
          .execute<PersonRow>(
            sql`SELECT ${personColumns} FROM ${users}
                WHERE ${users.id} = ANY(${sql.param(audience.people)}::int[])`,
          )
          .then((result) => result.rows)
      : [],
  ]);
  const festivalById = new Map(festivalRows.map((f) => [f.id, f]));
  const listById = new Map(listRows.map((l) => [l.id, l]));
  const personById = new Map(peopleRows.map((p) => [Number(p.id), p]));

  return {
    id: row.id,
    status: row.status,
    version: row.version,
    title: row.title,
    doc: Array.isArray(row.doc) ? row.doc : [],
    actionLabel: row.actionLabel,
    actionPath: row.actionPath,
    sendEmail: row.sendEmail,
    sendPush: row.sendPush,
    audience,
    audienceUnreadable: parsed === null,
    essential: row.essential,
    essentialReason: row.essentialReason,
    scheduledAt: row.scheduledAt,
    scheduleMissedAt: row.scheduleMissedAt,
    scheduleMissedReason:
      row.scheduleMissedReason as ComunicadoMissedReason | null,
    scheduleMissedDetail: row.scheduleMissedDetail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sources: {
      festivals: audience.festivals.flatMap((festivalId) => {
        const festival = festivalById.get(festivalId);
        return festival
          ? [{ ...festival, label: confirmadosListName(festival.name) }]
          : [];
      }),
      lists: audience.lists.flatMap((listId) => {
        const list = listById.get(listId);
        return list
          ? [
              {
                id: list.id,
                name: list.name,
                kind: list.kind,
                archived: list.archivedAt !== null,
              },
            ]
          : [];
      }),
      people: audience.people.flatMap((personId) => {
        const person = personById.get(personId);
        return person ? [toComposerPerson(person)] : [];
      }),
      missing: {
        festivals: audience.festivals.filter((f) => !festivalById.has(f)),
        lists: audience.lists.filter((l) => !listById.has(l)),
        people: audience.people.filter((p) => !personById.has(p)),
      },
    },
  };
}

export type ComunicadoPersonOption = {
  id: number;
  name: string;
  email: string;
  imageUrl: string | null;
  /** The tag "Administración". */
  isAdmin: boolean;
  /** Why they cannot receive it (B5, picked by name), or null. */
  skipReason: string | null;
  /**
   * "Recibe un correo real": on a preview, a participant picked by name gets
   * real email (decision 8). Development sends no email, so never there.
   */
  realEmailOnPreview: boolean;
};

/**
 * "Agregar por nombre o correo": participants and global admins (K13), 8 at
 * most. Festival admins and other roles are not offered.
 */
export async function searchComunicadoPeople(
  query: string,
): Promise<ComunicadoPersonOption[]> {
  const term = query.trim();
  if (term.length < 2 || term.length > 100) return [];
  if (!(await canRead())) return [];
  const result = await db.execute<PersonRow>(sql`
    SELECT ${personColumns}
    FROM ${users}
    WHERE ${users.role} IN ('user', 'admin') AND ${userSearchCondition(term)}
    ORDER BY ${nameOrder}
    LIMIT ${PEOPLE_SEARCH_LIMIT}`);
  const onPreview = serverEnv.VERCEL_ENV === "preview";
  return result.rows.map((row) => {
    const person = toComposerPerson(row);
    const isAdmin = person.role === "admin";
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      imageUrl: person.imageUrl,
      isAdmin,
      skipReason: person.skipReason,
      // Someone who cannot receive it gets no mail either.
      realEmailOnPreview: onPreview && !isAdmin && person.skipReason === null,
    };
  });
}
