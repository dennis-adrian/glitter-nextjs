#!/usr/bin/env tsx
/**
 * Builds the committed festival fixture from a real database.
 *
 * Run against a *copy* of production — never production itself — to refresh
 * `fixtures/festivals.json` when the festival structure changes materially.
 * Staging and local machines cannot reach that copy, which is why the result is
 * committed rather than extracted on demand.
 *
 *   SOURCE_POSTGRES_URL=postgres://... npx tsx scripts/seed/extract-festival-fixture.ts 489 488 482
 *
 * The connection string is deliberately its own variable: reading POSTGRES_URL
 * here would make it far too easy to point this at the database you are seeding.
 *
 * Nothing identifying a person leaves the source. Emails, names, phones, Clerk
 * ids, photos, bios and payment vouchers are all replaced or dropped, and the
 * result is checked for leaks before it is written.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { Client } from "pg";

import {
  dateToOffset,
  type FestivalFixture,
  type FixtureFestival,
  type FixtureReservation,
  type FixtureUser,
} from "./festival-fixture";

const OUTPUT = join(process.cwd(), "scripts/seed/fixtures/festivals.json");

/** Reserved TLD: mail to it can never be delivered anywhere. */
const MOCK_EMAIL_DOMAIN = "example.test";

const FIRST_NAMES = [
  "Ana",
  "Luis",
  "Sofía",
  "Mateo",
  "Camila",
  "Diego",
  "Valentina",
  "Joaquín",
  "Lucía",
  "Tomás",
  "Renata",
  "Emilio",
  "Paula",
  "Nicolás",
  "Isabela",
  "Bruno",
];
const LAST_NAMES = [
  "Rojas",
  "Vargas",
  "Mendoza",
  "Quiroga",
  "Salazar",
  "Terán",
  "Ledezma",
  "Aramayo",
  "Cabrera",
  "Montaño",
  "Peredo",
  "Zeballos",
  "Guzmán",
  "Áñez",
];

function fakeName(seq: number) {
  const first = FIRST_NAMES[seq % FIRST_NAMES.length];
  const last =
    LAST_NAMES[Math.floor(seq / FIRST_NAMES.length) % LAST_NAMES.length];
  return { firstName: first, lastName: `${last}` };
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function main() {
  const sourceUrl = process.env.SOURCE_POSTGRES_URL;
  if (!sourceUrl) {
    throw new Error(
      "SOURCE_POSTGRES_URL is not set. Point it at a copy of production, never production.",
    );
  }
  const festivalIds = process.argv.slice(2).map(Number).filter(Number.isFinite);
  if (festivalIds.length === 0) {
    throw new Error(
      "Pass the festival ids to extract, e.g. `... 489 488 482`.",
    );
  }

  const client = new Client({ connectionString: sourceUrl });
  await client.connect();

  try {
    const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
      (await client.query(sql, params)).rows as T[];

    // ---- users referenced by these festivals -------------------------------
    const userRows = await q<{
      id: number;
      role: string;
      status: string;
      category: string;
      participation_type: string;
      country: string | null;
      verified_at: Date | null;
    }>(
      `SELECT DISTINCT u.id, u.role, u.status, u.category, u.participation_type,
              u.country, u.verified_at
       FROM users u
       WHERE u.id IN (
         SELECT p.user_id FROM participations p
         JOIN stand_reservations r ON r.id = p.reservation_id
         WHERE r.festival_id = ANY($1::int[])
         UNION
         SELECT ur.user_id FROM user_requests ur WHERE ur.festival_id = ANY($1::int[])
       )
       ORDER BY u.id`,
      [festivalIds],
    );

    const userRef = new Map<number, number>();
    userRows.forEach((row, index) => userRef.set(row.id, index + 1));

    // ---- subcategories, carried by name so ids need not match --------------
    const subRows = await q<{ id: number; name: string; category: string }>(
      `SELECT id, name, category FROM subcategories ORDER BY id`,
    );
    const subRef = new Map<number, number>();
    subRows.forEach((row, index) => subRef.set(row.id, index + 1));

    const profileSubs = await q<{ profile_id: number; subcategory_id: number }>(
      `SELECT profile_id, subcategory_id FROM profile_subcategories
       WHERE profile_id = ANY($1::int[])`,
      [[...userRef.keys()]],
    );
    const subsByUser = new Map<number, number[]>();
    for (const row of profileSubs) {
      const ref = subRef.get(row.subcategory_id);
      if (!ref) continue;
      subsByUser.set(row.profile_id, [
        ...(subsByUser.get(row.profile_id) ?? []),
        ref,
      ]);
    }

    const festivals: FixtureFestival[] = [];
    // Anchors are per festival; user offsets need one reference point.
    let globalAnchor: Date | null = null;

    for (const festivalId of festivalIds) {
      const [festival] = await q<Record<string, unknown>>(
        `SELECT * FROM festivals WHERE id = $1`,
        [festivalId],
      );
      if (!festival) throw new Error(`Festival ${festivalId} not found`);

      const dates = await q<{ start_date: Date; end_date: Date }>(
        `SELECT start_date, end_date FROM festival_dates
         WHERE festival_id = $1 ORDER BY start_date`,
        [festivalId],
      );
      const anchor =
        dates[0]?.start_date ??
        (festival.start_date as Date | null) ??
        (festival.created_at as Date);
      globalAnchor ??= anchor;

      const lastEnd = dates[dates.length - 1]?.end_date ?? anchor;

      const sectors = await q<Record<string, unknown>>(
        `SELECT * FROM festival_sectors WHERE festival_id = $1 ORDER BY order_in_festival, id`,
        [festivalId],
      );
      const sectorRef = new Map<number, number>();
      sectors.forEach((s, i) => sectorRef.set(s.id as number, i + 1));

      const elements = await q<Record<string, unknown>>(
        `SELECT * FROM map_elements WHERE festival_sector_id = ANY($1::int[])`,
        [[...sectorRef.keys()]],
      );

      const groups = await q<{
        id: number;
        festival_sector_id: number;
        type: string;
      }>(
        `SELECT id, festival_sector_id, type FROM stand_groups
         WHERE festival_sector_id = ANY($1::int[]) ORDER BY id`,
        [[...sectorRef.keys()]],
      );
      const groupRef = new Map<number, number>();
      groups.forEach((g, i) => groupRef.set(g.id, i + 1));

      const stands = await q<Record<string, unknown>>(
        `SELECT * FROM stands WHERE festival_id = $1 ORDER BY festival_sector_id, stand_number`,
        [festivalId],
      );
      const standRef = new Map<number, number>();
      stands.forEach((s, i) => standRef.set(s.id as number, i + 1));

      const standSubs = await q<{ stand_id: number; subcategory_id: number }>(
        `SELECT stand_id, subcategory_id FROM stand_subcategories
         WHERE stand_id = ANY($1::int[])`,
        [[...standRef.keys()]],
      );
      const subsByStand = new Map<number, number[]>();
      for (const row of standSubs) {
        const ref = subRef.get(row.subcategory_id);
        if (!ref) continue;
        subsByStand.set(row.stand_id, [
          ...(subsByStand.get(row.stand_id) ?? []),
          ref,
        ]);
      }

      const enrollments = await q<{
        user_id: number;
        type: string;
        status: string;
      }>(
        `SELECT user_id, type, status FROM user_requests WHERE festival_id = $1`,
        [festivalId],
      );

      const reservations = await q<Record<string, unknown>>(
        `SELECT * FROM stand_reservations WHERE festival_id = $1 ORDER BY id`,
        [festivalId],
      );
      const reservationIds = reservations.map((r) => r.id as number);

      const participants = await q<{ reservation_id: number; user_id: number }>(
        `SELECT reservation_id, user_id FROM participations
         WHERE reservation_id = ANY($1::int[])`,
        [reservationIds],
      );
      const members = await q<{
        reservation_id: number;
        stand_id: number;
        position: number;
        released_at: Date | null;
      }>(
        `SELECT reservation_id, stand_id, position, released_at
         FROM stand_reservation_stands WHERE reservation_id = ANY($1::int[])`,
        [reservationIds],
      );
      const invoices = await q<Record<string, unknown>>(
        `SELECT * FROM invoices WHERE reservation_id = ANY($1::int[])`,
        [reservationIds],
      );
      const invoiceIds = invoices.map((i) => i.id as number);
      const payments = await q<Record<string, unknown>>(
        `SELECT * FROM payments WHERE invoice_id = ANY($1::int[])`,
        [invoiceIds],
      );

      const fixtureReservations: FixtureReservation[] = reservations.map(
        (r) => {
          const id = r.id as number;
          const invoice = invoices.find((i) => i.reservation_id === id);
          const invoicePayments = invoice
            ? payments.filter((p) => p.invoice_id === invoice.id)
            : [];
          return {
            ref: id,
            standRef: standRef.get(r.stand_id as number) ?? 0,
            status: r.status as string,
            source: r.source as string,
            ownerRef: userRef.get(r.owner_user_id as number) ?? null,
            priceAmountSnapshot: num(r.price_amount_snapshot),
            individualPriceSnapshot: num(r.individual_price_snapshot),
            sharedPriceSnapshot: num(r.shared_price_snapshot),
            bookedParticipantCount: Number(r.booked_participant_count ?? 1),
            createdAtOffset: dateToOffset(anchor, r.created_at as Date),
            revealAtOffset: r.reveal_at
              ? dateToOffset(anchor, r.reveal_at as Date)
              : null,
            participantRefs: participants
              .filter((p) => p.reservation_id === id)
              .map((p) => userRef.get(p.user_id))
              .filter((ref): ref is number => ref != null),
            members: members
              .filter((m) => m.reservation_id === id)
              .map((m) => ({
                standRef: standRef.get(m.stand_id) ?? 0,
                position: m.position,
                released: m.released_at != null,
              })),
            invoice: invoice
              ? {
                  amount: num(invoice.amount) ?? 0,
                  originalAmount: num(invoice.original_amount) ?? 0,
                  discountAmount: num(invoice.discount_amount) ?? 0,
                  status: invoice.status as string,
                  userRef: userRef.get(invoice.user_id as number) ?? 0,
                  dateOffset: dateToOffset(anchor, invoice.date as Date),
                  dueAtOffset: invoice.due_at
                    ? dateToOffset(anchor, invoice.due_at as Date)
                    : null,
                  payments: invoicePayments.map((p) => ({
                    amount: num(p.amount) ?? 0,
                    dateOffset: dateToOffset(anchor, p.date as Date),
                    uploadedByRef:
                      userRef.get(p.uploaded_by_user_id as number) ?? null,
                    // voucher_url and file_key are deliberately not carried.
                  })),
                }
              : null,
          };
        },
      );

      festivals.push({
        name: festival.name as string,
        description: (festival.description as string) ?? null,
        festivalType: festival.festival_type as string,
        status: festival.status as string,
        locationLabel: (festival.location_label as string) ?? null,
        address: (festival.address as string) ?? null,
        publicRegistration: Boolean(festival.public_registration),
        eventDayRegistration: Boolean(festival.event_day_registration),
        keepStoreOpen: Boolean(festival.keep_store_open),
        participantTermsEnabled: Boolean(festival.participant_terms_enabled),
        reservationHoldMinutes: Number(festival.reservation_hold_minutes ?? 5),
        // Filled in by the seeder's schedule, not copied from the source.
        startsInDays: 0,
        durationDays: Math.max(
          1,
          Math.round(dateToOffset(anchor, lastEnd as Date)) + 1,
        ),
        reservationsStartOffset: festival.reservations_start_date
          ? dateToOffset(anchor, festival.reservations_start_date as Date)
          : null,
        dates: dates.map((d) => ({
          startOffset: dateToOffset(anchor, d.start_date),
          endOffset: dateToOffset(anchor, d.end_date),
        })),
        sectors: sectors.map((s) => ({
          ref: sectorRef.get(s.id as number)!,
          name: s.name as string,
          description: (s.description as string) ?? null,
          orderInFestival: Number(s.order_in_festival ?? 0),
          mapOriginX: num(s.map_origin_x),
          mapOriginY: num(s.map_origin_y),
          mapWidth: num(s.map_width),
          mapHeight: num(s.map_height),
          mapElements: elements
            .filter((e) => e.festival_sector_id === s.id)
            .map((e) => ({
              type: e.type as string,
              label: (e.label as string) ?? null,
              labelPosition: (e.label_position as string) ?? "bottom",
              labelFontSize: Number(e.label_font_size ?? 2),
              labelFontWeight: (e.label_font_weight as string) ?? null,
              showIcon: Boolean(e.show_icon),
              positionLeft: num(e.position_left),
              positionTop: num(e.position_top),
              width: num(e.width),
              height: num(e.height),
              rotation: Number(e.rotation ?? 0),
            })),
        })),
        standGroups: groups.map((g) => ({
          ref: groupRef.get(g.id)!,
          sectorRef: sectorRef.get(g.festival_sector_id)!,
          type: g.type,
        })),
        stands: stands.map((s) => ({
          ref: standRef.get(s.id as number)!,
          sectorRef: sectorRef.get(s.festival_sector_id as number)!,
          label: (s.label as string) ?? null,
          standNumber: Number(s.stand_number),
          status: s.status as string,
          standCategory: s.stand_category as string,
          participationType: s.participation_type as string,
          zone: s.zone as string,
          orientation: (s.orientation as string) ?? null,
          width: num(s.width),
          height: num(s.height),
          positionLeft: num(s.position_left),
          positionTop: num(s.position_top),
          price: num(s.price) ?? 0,
          individualPrice: num(s.individual_price) ?? num(s.price) ?? 0,
          sharedPrice: num(s.shared_price),
          groupRef: s.stand_group_id
            ? (groupRef.get(s.stand_group_id as number) ?? null)
            : null,
          subcategoryRefs: subsByStand.get(s.id as number) ?? [],
        })),
        enrollments: enrollments
          .map((e) => ({
            userRef: userRef.get(e.user_id)!,
            type: e.type,
            status: e.status,
          }))
          .filter((e) => e.userRef != null),
        reservations: fixtureReservations,
      });
    }

    const users: FixtureUser[] = userRows.map((row) => {
      const ref = userRef.get(row.id)!;
      const { firstName, lastName } = fakeName(ref);
      return {
        ref,
        // Undeliverable by construction.
        email: `participante${ref}@${MOCK_EMAIL_DOMAIN}`,
        displayName: `${firstName} ${lastName}`,
        firstName,
        lastName,
        role: row.role,
        status: row.status,
        category: row.category,
        participationType: row.participation_type,
        country: row.country,
        verifiedAtOffset:
          row.verified_at && globalAnchor
            ? dateToOffset(globalAnchor, row.verified_at)
            : null,
        subcategoryRefs: subsByUser.get(row.id) ?? [],
      };
    });

    const fixture: FestivalFixture = {
      version: 1,
      generatedFrom: `festivals ${festivalIds.join(", ")}`,
      users,
      subcategories: subRows.map((row) => ({
        ref: subRef.get(row.id)!,
        name: row.name,
        category: row.category,
      })),
      festivals,
    };

    assertNoPersonalData(fixture);

    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, `${JSON.stringify(fixture, null, 2)}\n`);
    console.info(
      `Wrote ${OUTPUT}: ${users.length} users, ${festivals.length} festivals, ` +
        `${festivals.reduce((n, f) => n + f.reservations.length, 0)} reservations.`,
    );
  } finally {
    await client.end();
  }
}

/**
 * Last line of defence before the fixture is committed.
 *
 * A missed column is the realistic failure here, not a missed design decision,
 * so this greps the serialised output rather than trusting the mapping above.
 */
function assertNoPersonalData(fixture: FestivalFixture) {
  const serialised = JSON.stringify(fixture);

  const emails = serialised.match(/[\w.+-]+@[\w.-]+/g) ?? [];
  const foreign = emails.filter(
    (email) => !email.endsWith(`@${MOCK_EMAIL_DOMAIN}`),
  );
  if (foreign.length > 0) {
    throw new Error(
      `Refusing to write: ${foreign.length} non-mock email(s) in the fixture, e.g. ${foreign[0]}`,
    );
  }

  for (const [label, pattern] of [
    ["phone number", /"phone[A-Za-z]*":\s*"[^"]/],
    ["clerk id", /user_[A-Za-z0-9]{20,}/],
    ["voucher url", /"voucher[A-Za-z]*":\s*"[^"]/],
    ["uploadthing key", /utfs\.io|ufs\.sh/],
  ] as const) {
    if (pattern.test(serialised)) {
      throw new Error(
        `Refusing to write: fixture appears to contain a ${label}.`,
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
