import "server-only";

import { eq, inArray, sql, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";

import { STORE_TIMEZONE } from "@/app/lib/formatters";
import {
  NOTIFICATION_LOG_CHANNELS,
  NOTIFICATION_LOG_STATUSES,
  type NotificationLogChannel,
  type NotificationLogLink,
  type NotificationLogPage,
  type NotificationLogPerson,
  type NotificationLogRow,
  type NotificationLogSearchParams,
  type NotificationLogSource,
  type NotificationLogStatus,
} from "@/app/lib/notifications/admin-log-definitions";
import { redactNotificationLogError } from "@/app/lib/notifications/admin-log-errors";
import { isSensitiveNotificationKind } from "@/app/lib/notifications/registry";
import { buildSearchPattern } from "@/app/lib/programs/search";
import { requireAdmin } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";
import {
  festivalReservationsOpenNotices,
  festivalStandsAvailableReminders,
  notificationCampaigns,
  users,
} from "@/db/schema";

/**
 * Reads for the admin notification log (`/dashboard/notifications`).
 *
 * One list over four tables, each turned into the same columns and merged
 * newest first. Every arm selects named columns: a push subscription's
 * endpoint and keys, an email's payload snapshot and an inbox item's data
 * never leave the database. The one thing read from an inbox item's data is
 * the id of the infraction or sanction a disciplinary notice is about, to
 * link to it.
 */

/** Longest error text sent to the page; provider errors can be long. */
const MAX_ERROR_LENGTH = 500;

/** `YYYY-MM-DD` read as a Bolivian calendar day, which is how admins think of dates. */
function startOfLocalDay(value: string): DateTime | null {
  const date = DateTime.fromISO(value, { zone: STORE_TIMEZONE }).startOf("day");
  return date.isValid ? date : null;
}

/**
 * An inclusive `from`–`to` range of Bolivian days, as the UTC wall-clock
 * strings the `timestamp` columns hold. A reversed range is swapped rather
 * than read as "nothing".
 */
export function notificationLogDayBounds(fromDay?: string, toDay?: string) {
  let first = fromDay ? startOfLocalDay(fromDay) : null;
  let last = toDay ? startOfLocalDay(toDay) : null;
  if (first && last && last < first) [first, last] = [last, first];
  const iso = (date: DateTime) => date.toUTC().toISO({ includeOffset: false });
  return {
    from: first ? iso(first) : null,
    toExclusive: last ? iso(last.plus({ days: 1 })) : null,
  };
}

/**
 * A raw timestamp column comes back as the driver's string in UTC wall time
 * (`2026-11-10 14:03:22.123`), the way drizzle reads the mapped ones.
 */
export function parseLogTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim().replace(" ", "T");
  const date = new Date(
    /[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

type Filters = {
  statuses: NotificationLogStatus[];
  from: string | null;
  toExclusive: string | null;
  pattern: string | null;
  /** A `#123` or `123` search also finds account 123. */
  userId: number | null;
  /**
   * `?user=`: only this account's rows, plus mail to its current address on
   * rows that name no account. The address is lowercased and trimmed.
   */
  user: { id: number; email: string | null } | null;
};

/**
 * The exact per-person filter. A row that names an account must name this
 * one; a row that names none (a visitor's comunicado, an admin copy) counts
 * when it went to this account's current address. Rows naming another
 * account never match, whatever address they went to.
 */
function exactUserCondition(
  filters: Filters,
  userIdColumn: SQL,
  emailColumn: SQL | null,
): SQL | null {
  const user = filters.user;
  if (!user) return null;
  if (!emailColumn || !user.email) {
    return sql`${userIdColumn} = ${user.id}::integer`;
  }
  return sql`(${userIdColumn} = ${user.id}::integer OR (
    ${userIdColumn} IS NULL AND lower(trim(${emailColumn})) = ${user.email}
  ))`;
}

/** The arm's conditions with the per-person filter, when there is one. */
function withUser(
  conditions: SQL[],
  filters: Filters,
  userIdColumn: SQL,
  emailColumn: SQL | null,
) {
  const condition = exactUserCondition(filters, userIdColumn, emailColumn);
  return condition ? [...conditions, condition] : conditions;
}

/**
 * Matches the person by name, account email or `#id`, or the address an
 * email went to, including a visitor's by their name.
 */
function personCondition(
  filters: Filters,
  userIdColumn: SQL,
  emailColumn: SQL | null,
): SQL | null {
  if (!filters.pattern) return null;
  const pattern = filters.pattern;
  const parts: SQL[] = [
    sql`${userIdColumn} IN (
      SELECT u.id FROM users u
      WHERE lower(concat_ws(' ', u.display_name, u.first_name, u.last_name, u.email)) LIKE ${pattern}
    )`,
  ];
  if (filters.userId !== null) {
    parts.push(sql`${userIdColumn} = ${filters.userId}::integer`);
  }
  if (emailColumn) {
    parts.push(sql`lower(${emailColumn}) LIKE ${pattern}`);
    parts.push(sql`lower(trim(${emailColumn})) IN (
      SELECT lower(trim(v.email)) FROM visitors v
      WHERE lower(concat_ws(' ', v.first_name, v.last_name)) LIKE ${pattern}
    )`);
  }
  return sql`(${sql.join(parts, sql` OR `)})`;
}

function commonConditions(
  filters: Filters,
  createdAt: SQL,
  status: SQL,
  person: SQL | null,
): SQL[] {
  const conditions: SQL[] = [];
  if (filters.statuses.length > 0) {
    conditions.push(
      sql`${status} IN (${sql.join(
        filters.statuses.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    );
  }
  if (filters.from)
    conditions.push(sql`${createdAt} >= ${filters.from}::timestamp`);
  if (filters.toExclusive) {
    conditions.push(sql`${createdAt} < ${filters.toExclusive}::timestamp`);
  }
  if (person) conditions.push(person);
  return conditions;
}

function where(conditions: SQL[]) {
  return conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;
}

// The disciplinary case an inbox item is about, from its data's ids only.
const NOTIFICATION_ENTITY_TYPE = sql`CASE
  WHEN n.data->>'sanctionId' ~ '^[0-9]{1,9}$' THEN 'sanction'
  WHEN n.data->>'infractionId' ~ '^[0-9]{1,9}$' THEN 'infraction'
END`;
const NOTIFICATION_ENTITY_ID = sql`CASE
  WHEN n.data->>'sanctionId' ~ '^[0-9]{1,9}$' THEN (n.data->>'sanctionId')::integer
  WHEN n.data->>'infractionId' ~ '^[0-9]{1,9}$' THEN (n.data->>'infractionId')::integer
END`;

/** Each arm's columns, in this order. */
type Arm = { select: SQL; from: SQL; conditions: SQL[] };

function inboxArm(filters: Filters): Arm {
  const status = sql`'sent'`;
  return {
    select: sql`
      'inbox'::text AS source, n.id, 'in_app'::text AS channel,
      ${status}::text AS status, n.kind, n.title, n.user_id,
      NULL::text AS recipient_email, NULL::text AS device_label,
      false AS device_removed, NULL::text AS lane, NULL::integer AS attempts,
      NULL::text AS last_error, n.created_at, n.created_at AS sent_at,
      n.read_at, n.retracted_at, n.campaign_id,
      NULL::integer AS reservation_id,
      ${NOTIFICATION_ENTITY_TYPE} AS entity_type,
      ${NOTIFICATION_ENTITY_ID} AS entity_id,
      false AS is_resend`,
    from: sql`FROM notifications n`,
    conditions: withUser(
      commonConditions(
        filters,
        sql`n.created_at`,
        status,
        personCondition(filters, sql`n.user_id`, null),
      ),
      filters,
      sql`n.user_id`,
      null,
    ),
  };
}

function deliveryArm(filters: Filters, channels: ("email" | "push")[]): Arm {
  const conditions = commonConditions(
    filters,
    sql`d.created_at`,
    sql`d.status::text`,
    personCondition(
      filters,
      sql`coalesce(d.user_id, n.user_id)`,
      sql`d.recipient_email`,
    ),
  );
  const userCondition = exactUserCondition(
    filters,
    sql`coalesce(d.user_id, n.user_id)`,
    sql`d.recipient_email`,
  );
  if (userCondition) conditions.push(userCondition);
  if (channels.length === 1) {
    conditions.unshift(
      sql`d.channel = ${channels[0]}::notification_delivery_channel`,
    );
  }
  return {
    // Only the device's label: its endpoint and keys stay in the table.
    select: sql`
      'delivery'::text AS source, d.id, d.channel::text AS channel,
      d.status::text AS status, d.template_key AS kind, n.title,
      coalesce(d.user_id, n.user_id) AS user_id, d.recipient_email,
      ps.device_label,
      (d.channel = 'push' AND d.push_subscription_id IS NULL) AS device_removed,
      d.lane::text AS lane, d.attempts, d.last_error, d.created_at, d.sent_at,
      NULL::timestamp AS read_at, NULL::timestamp AS retracted_at,
      coalesce(d.campaign_id, n.campaign_id) AS campaign_id,
      NULL::integer AS reservation_id,
      ${NOTIFICATION_ENTITY_TYPE} AS entity_type,
      ${NOTIFICATION_ENTITY_ID} AS entity_id,
      (d.resend_of_delivery_id IS NOT NULL) AS is_resend`,
    from: sql`FROM notification_deliveries d
      LEFT JOIN notifications n ON n.id = d.notification_id
      LEFT JOIN push_subscriptions ps ON ps.id = d.push_subscription_id`,
    conditions,
  };
}

/** The outboxes say `completed` for what the deliveries call `sent`. */
function outboxStatus(alias: string) {
  return sql.raw(
    `(CASE ${alias}.status::text WHEN 'completed' THEN 'sent' ELSE ${alias}.status::text END)`,
  );
}

function reservationOutboxArm(filters: Filters): Arm {
  const status = outboxStatus("r");
  return {
    select: sql`
      'reservation_outbox'::text AS source, r.id, 'email'::text AS channel,
      ${status} AS status, r.notification_kind AS kind, NULL::text AS title,
      r.user_id, r.recipient_email, NULL::text AS device_label,
      false AS device_removed, 'transactional'::text AS lane, r.attempts,
      r.last_error, r.created_at,
      CASE WHEN r.status = 'completed' THEN r.completed_at END AS sent_at,
      NULL::timestamp AS read_at, NULL::timestamp AS retracted_at,
      NULL::integer AS campaign_id, r.reservation_id,
      NULL::text AS entity_type, NULL::integer AS entity_id,
      false AS is_resend`,
    from: sql`FROM reservation_notification_jobs r`,
    conditions: withUser(
      commonConditions(
        filters,
        sql`r.created_at`,
        status,
        personCondition(filters, sql`r.user_id`, sql`r.recipient_email`),
      ),
      filters,
      sql`r.user_id`,
      sql`r.recipient_email`,
    ),
  };
}

function disciplinaryOutboxArm(filters: Filters): Arm {
  const status = outboxStatus("j");
  return {
    // The kind is stored per entity ("registered"); prefixed, it reads like
    // the inbox kind of the same notice ("infraction_registered").
    select: sql`
      'disciplinary_outbox'::text AS source, j.id, 'email'::text AS channel,
      ${status} AS status,
      (CASE WHEN j.entity_type LIKE 'sanction%' THEN 'sanction_' ELSE 'infraction_' END)
        || j.notification_kind AS kind,
      NULL::text AS title, j.user_id, j.recipient_email,
      NULL::text AS device_label, false AS device_removed,
      'transactional'::text AS lane, j.attempts, j.last_error, j.created_at,
      CASE WHEN j.status = 'completed' THEN j.completed_at END AS sent_at,
      NULL::timestamp AS read_at, NULL::timestamp AS retracted_at,
      NULL::integer AS campaign_id, NULL::integer AS reservation_id,
      (CASE WHEN j.entity_type LIKE 'sanction%' THEN 'sanction' ELSE 'infraction' END) AS entity_type,
      j.entity_id, false AS is_resend`,
    from: sql`FROM disciplinary_notification_jobs j`,
    conditions: withUser(
      commonConditions(
        filters,
        sql`j.created_at`,
        status,
        personCondition(filters, sql`j.user_id`, sql`j.recipient_email`),
      ),
      filters,
      sql`j.user_id`,
      sql`j.recipient_email`,
    ),
  };
}

function armsFor(channels: NotificationLogChannel[], filters: Filters): Arm[] {
  const wanted = new Set(
    channels.length > 0 ? channels : NOTIFICATION_LOG_CHANNELS,
  );
  const arms: Arm[] = [];
  // An inbox item is always "sent": a status filter without it skips them.
  if (
    wanted.has("in_app") &&
    (filters.statuses.length === 0 || filters.statuses.includes("sent"))
  ) {
    arms.push(inboxArm(filters));
  }
  const deliveryChannels = (["email", "push"] as const).filter((channel) =>
    wanted.has(channel),
  );
  if (deliveryChannels.length > 0) {
    arms.push(deliveryArm(filters, [...deliveryChannels]));
  }
  if (wanted.has("email")) {
    arms.push(reservationOutboxArm(filters));
    arms.push(disciplinaryOutboxArm(filters));
  }
  return arms;
}

type RawLogRow = {
  source: NotificationLogSource;
  id: number;
  channel: NotificationLogChannel;
  status: string;
  kind: string;
  title: string | null;
  user_id: number | null;
  recipient_email: string | null;
  device_label: string | null;
  device_removed: boolean;
  lane: "transactional" | "bulk" | null;
  attempts: number | null;
  last_error: string | null;
  created_at: unknown;
  sent_at: unknown;
  read_at: unknown;
  retracted_at: unknown;
  campaign_id: number | null;
  reservation_id: number | null;
  entity_type: "infraction" | "sanction" | null;
  entity_id: number | null;
  is_resend: boolean;
};

// Ties broken the same way on every page, so paging never repeats a row.
const ORDER = sql`ORDER BY created_at DESC, source ASC, id DESC`;

async function fetchRows(arms: Arm[], limit: number, offset: number) {
  // Each arm keeps only what could reach this page before they are merged.
  const window = limit + offset;
  const parts = arms.map(
    (arm) =>
      sql`(SELECT ${arm.select} ${arm.from} ${where(arm.conditions)} ${ORDER} LIMIT ${window})`,
  );
  const result = await db.execute<RawLogRow>(sql`
    SELECT * FROM (${sql.join(parts, sql` UNION ALL `)}) log
    ${ORDER}
    LIMIT ${limit} OFFSET ${offset}
  `);
  return result.rows;
}

async function countRows(arms: Arm[]) {
  const parts = arms.map(
    (arm) => sql`(SELECT count(*) ${arm.from} ${where(arm.conditions)})`,
  );
  const result = await db.execute<{ total: string | number }>(
    sql`SELECT (${sql.join(parts, sql` + `)})::integer AS total`,
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function peopleFor(ids: number[]) {
  const people = new Map<number, { name: string | null; email: string }>();
  if (ids.length === 0) return people;
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, ids));
  for (const row of rows) {
    people.set(row.id, { name: getUserName(row) || null, email: row.email });
  }
  return people;
}

type CampaignInfo = {
  type: (typeof notificationCampaigns.$inferSelect)["type"];
  title: string;
  festivalId: number | null;
};

async function campaignsFor(ids: number[]) {
  const campaigns = new Map<number, CampaignInfo>();
  if (ids.length === 0) return campaigns;
  const [rows, opens, reminders] = await Promise.all([
    db
      .select({
        id: notificationCampaigns.id,
        type: notificationCampaigns.type,
        title: notificationCampaigns.title,
      })
      .from(notificationCampaigns)
      .where(inArray(notificationCampaigns.id, ids)),
    db
      .select({
        campaignId: festivalReservationsOpenNotices.campaignId,
        festivalId: festivalReservationsOpenNotices.festivalId,
      })
      .from(festivalReservationsOpenNotices)
      .where(inArray(festivalReservationsOpenNotices.campaignId, ids)),
    db
      .select({
        campaignId: festivalStandsAvailableReminders.campaignId,
        festivalId: festivalStandsAvailableReminders.festivalId,
      })
      .from(festivalStandsAvailableReminders)
      .where(inArray(festivalStandsAvailableReminders.campaignId, ids)),
  ]);
  const festivalByCampaign = new Map<number, number>();
  for (const row of [...opens, ...reminders]) {
    festivalByCampaign.set(row.campaignId, row.festivalId);
  }
  for (const row of rows) {
    campaigns.set(row.id, {
      type: row.type,
      title: row.title,
      festivalId: festivalByCampaign.get(row.id) ?? null,
    });
  }
  return campaigns;
}

/** Where an admin reads more about the row: its campaign, reservation or case. */
export function notificationLogLinks(
  row: Pick<
    RawLogRow,
    "campaign_id" | "reservation_id" | "entity_type" | "entity_id"
  >,
  campaign: CampaignInfo | null,
): NotificationLogLink[] {
  const links: NotificationLogLink[] = [];
  if (row.campaign_id !== null && campaign) {
    const id = row.campaign_id;
    if (campaign.type === "comunicado") {
      links.push({
        label: "Ver reporte del comunicado",
        href: `/dashboard/communications/${id}`,
      });
    } else if (campaign.type === "credit_gift") {
      links.push({
        label: "Ver el regalo",
        href: `/dashboard/credits/gifts/${id}`,
      });
    } else if (campaign.festivalId !== null) {
      links.push({
        label: "Ver el festival",
        href: `/dashboard/festivals/${campaign.festivalId}`,
      });
    }
  }
  if (row.reservation_id !== null) {
    links.push({
      label: "Ver la reserva",
      href: `/dashboard/reservations/${row.reservation_id}/edit`,
    });
  }
  if (row.entity_type && row.entity_id !== null) {
    links.push(
      row.entity_type === "sanction"
        ? {
            label: "Ver la sanción",
            href: `/dashboard/sanctions/${row.entity_id}`,
          }
        : {
            label: "Ver la infracción",
            href: `/dashboard/infractions/${row.entity_id}`,
          },
    );
  }
  return links;
}

function truncateError(value: string | null) {
  if (!value) return null;
  // Outboxes store free text: nothing it quotes may reach the browser.
  const text = redactNotificationLogError(value);
  if (!text) return null;
  return text.length > MAX_ERROR_LENGTH
    ? `${text.slice(0, MAX_ERROR_LENGTH - 1)}…`
    : text;
}

function isStatus(value: string): value is NotificationLogStatus {
  return (NOTIFICATION_LOG_STATUSES as readonly string[]).includes(value);
}

/** A `#123` or bare `123` search, as an account id. */
function searchedUserId(query: string) {
  const match = /^#?(\d{1,9})$/.exec(query.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return id > 0 ? id : null;
}

/** An account by id; one that no longer exists keeps only its id. */
async function lookupPerson(id: number): Promise<NotificationLogPerson> {
  const [row] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) return { id, name: null, email: null };
  return { id, name: getUserName(row) || null, email: row.email };
}

/** Who `?user=` names, for the page's banner. Admins only. */
export async function fetchNotificationLogPerson(
  id: number,
): Promise<NotificationLogPerson | null> {
  if (!(await requireAdmin())) return null;
  return lookupPerson(id);
}

/**
 * One page of the log, newest first. Null for anyone but an admin: it names
 * everyone we wrote to and what about.
 */
export async function fetchNotificationLogPage(
  params: NotificationLogSearchParams,
): Promise<NotificationLogPage | null> {
  if (!(await requireAdmin())) return null;

  const { from, toExclusive } = notificationLogDayBounds(
    params.from,
    params.to,
  );
  const query = params.query.trim();
  const person =
    params.user !== undefined ? await lookupPerson(params.user) : null;
  const filters: Filters = {
    statuses: params.status,
    from,
    toExclusive,
    pattern: query ? buildSearchPattern(query.toLowerCase()) : null,
    userId: searchedUserId(query),
    user: person
      ? {
          id: person.id,
          email: person.email ? person.email.trim().toLowerCase() : null,
        }
      : null,
  };
  const arms = armsFor(params.channel, filters);
  if (arms.length === 0) return { rows: [], total: 0 };

  const [rawRows, total] = await Promise.all([
    fetchRows(arms, params.limit, params.offset),
    countRows(arms),
  ]);

  const [people, campaigns] = await Promise.all([
    peopleFor([
      ...new Set(
        rawRows
          .map((row) => row.user_id)
          .filter((id): id is number => id !== null),
      ),
    ]),
    campaignsFor([
      ...new Set(
        rawRows
          .map((row) => row.campaign_id)
          .filter((id): id is number => id !== null),
      ),
    ]),
  ]);

  const rows = rawRows.map((row): NotificationLogRow => {
    const person = row.user_id !== null ? people.get(row.user_id) : undefined;
    const campaign =
      row.campaign_id !== null
        ? (campaigns.get(row.campaign_id) ?? null)
        : null;
    // Disciplinary notices keep their content off this list, as their push
    // keeps it off a lock screen; the linked case shows it.
    const reserved =
      row.source === "disciplinary_outbox" ||
      isSensitiveNotificationKind(row.kind);
    const createdAt = parseLogTimestamp(row.created_at) ?? new Date(0);
    return {
      key: `${row.source}:${row.id}`,
      source: row.source,
      id: Number(row.id),
      channel: row.channel,
      status: isStatus(row.status) ? row.status : "pending",
      kind: row.kind,
      title: reserved ? null : (row.title ?? campaign?.title ?? null),
      reserved,
      recipient: {
        userId: row.user_id,
        name: person?.name ?? null,
        email: row.recipient_email ?? person?.email ?? null,
      },
      deviceLabel: row.channel === "push" ? row.device_label : null,
      deviceRemoved: row.device_removed === true,
      lane: row.lane,
      attempts: row.attempts === null ? null : Number(row.attempts),
      error: truncateError(row.last_error),
      createdAt,
      sentAt: parseLogTimestamp(row.sent_at),
      readAt: parseLogTimestamp(row.read_at),
      retractedAt: parseLogTimestamp(row.retracted_at),
      isResend: row.is_resend === true,
      links: notificationLogLinks(row, campaign),
    };
  });

  return { rows, total };
}
