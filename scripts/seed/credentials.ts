import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  COUNTABLE_RESERVATION_STATUSES,
  CREDENTIALS_COPY,
  DEFAULT_CREDENTIAL_RULES,
} from "@/app/lib/credentials/definitions";
import type { db as DbType } from "@/db";
import { seedDemoEmail } from "@/scripts/seed/demo-users";
import {
  credentialPrintBatches,
  credentialPrintBatchItems,
  externalParticipants,
  festivalExtraCredentials,
  festivals,
  festivalStaffMembers,
  reservationExternalParticipants,
  reservationParticipants,
  standReservations,
  standReservationStands,
  staffMembers,
  stands,
  users,
  volunteerApplications,
  volunteerRoles,
} from "@/db/schema";

/**
 * Development fixtures for the Credenciales page (docs/PLAN-credenciales.md
 * §12): without them three of its six groups are empty locally. Added to the
 * most recent festival (latest start date, undated ones last), idempotent:
 * every row is found by a fixed name, email or stand number before it is
 * created, so re-running adds only what is missing. Each reservation and the
 * batch are written in a transaction, so a failed run leaves nothing half
 * made for the next one to skip.
 *
 * Called by `scripts/seed.ts`, behind the same development-only gate.
 */

const ROLE_NAMES = ["Acreditación (demo)", "Orientación (demo)"] as const;
const VOLUNTEERS = [
  { email: "credenciales-demo-1@example.test", fullName: "Camila Rojas", role: 0, status: "accepted" },
  { email: "credenciales-demo-2@example.test", fullName: "Andrés Quispe", role: 1, status: "accepted" },
  { email: "credenciales-demo-3@example.test", fullName: "Lucía Mamani", role: null, status: "accepted" },
  { email: "credenciales-demo-4@example.test", fullName: "Ximena Paz", role: null, status: "pending" },
] as const;
const EXTERNAL_NAME = "Refugio Huellitas (demo)";
/** Stands added for these fixtures, out of the way of the mirrored map. */
const STAND_LABEL = "Z";
const EXTERNAL_STAND = 901;
const FULL_TABLE_STANDS = [902, 903] as const;
/**
 * The demo illustrator. Its local row stores the notification address
 * (`SEED_DEMO_EMAIL_BASE`'s `+illustration`), not the `+clerk_test` one Clerk
 * signs in with; the latter is kept for databases seeded before that split.
 */
const fullTableEmails = () => [
  seedDemoEmail("illustration"),
  "illustration+clerk_test@example.com",
];
const STAFF = [
  { fullName: "Daniela Arce (demo)", roleLabel: "Dirección" },
  { fullName: "Rodrigo Molina (demo)", roleLabel: "Producción" },
] as const;
const EXTRA_LABEL = "Prensa (demo)";

export type SeedCredentialsResult = {
  festival: string | null;
  createdVolunteers: number;
  createdExternal: boolean;
  createdFullTable: boolean;
  createdStaff: number;
  createdExtra: boolean;
  createdBatch: boolean;
};

type Tx = Parameters<Parameters<typeof DbType.transaction>[0]>[0];

/**
 * Whether a live reservation holds one of these stands: an unreleased member
 * in a counted status, the same rule as the database's one-occupant index
 * (`stand_reservation_stands_active_stand_unique`). A released or cancelled
 * one does not block the fixture.
 */
async function standsTaken(tx: Tx, standIds: number[]) {
  if (standIds.length === 0) return false;
  const rows = await tx
    .select({ id: standReservationStands.id })
    .from(standReservationStands)
    .where(
      and(
        inArray(standReservationStands.standId, standIds),
        isNull(standReservationStands.releasedAt),
        inArray(standReservationStands.reservationStatus, [...COUNTABLE_RESERVATION_STATUSES]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * The fixture's stands, in order, or null when a live reservation already
 * holds any of them. Every existing stand is checked before a missing one is
 * created, and the caller runs this in the transaction that writes the
 * reservation, so a skipped or failed run leaves no stand behind.
 */
async function claimFixtureStands(
  tx: Tx,
  festivalId: number,
  standNumbers: readonly number[],
): Promise<number[] | null> {
  const existing = await tx
    .select({ id: stands.id, standNumber: stands.standNumber })
    .from(stands)
    .where(
      and(
        eq(stands.festivalId, festivalId),
        eq(stands.label, STAND_LABEL),
        inArray(stands.standNumber, [...standNumbers]),
      ),
    );
  if (await standsTaken(tx, existing.map((stand) => stand.id))) return null;
  const ids: number[] = [];
  for (const standNumber of standNumbers) {
    const found = existing.find((stand) => stand.standNumber === standNumber);
    if (found) {
      // A cancelled reservation frees its stand ("available"); booking it
      // again marks it reserved, as the app's own booking paths do.
      await tx.update(stands).set({ status: "reserved" }).where(eq(stands.id, found.id));
      ids.push(found.id);
      continue;
    }
    const [created] = await tx
      .insert(stands)
      .values({
        festivalId,
        label: STAND_LABEL,
        standNumber,
        standCategory: "illustration",
        status: "reserved",
      })
      .returning({ id: stands.id });
    ids.push(created!.id);
  }
  return ids;
}

export async function seedCredentials(
  database: typeof DbType,
): Promise<SeedCredentialsResult> {
  const [festival] = await database
    .select({ id: festivals.id, name: festivals.name })
    .from(festivals)
    // The latest edition by date; undated ones last, then the newest row.
    .orderBy(sql`${festivals.startDate} DESC NULLS LAST`, desc(festivals.id))
    .limit(1);
  if (!festival) {
    return {
      festival: null,
      createdVolunteers: 0,
      createdExternal: false,
      createdFullTable: false,
      createdStaff: 0,
      createdExtra: false,
      createdBatch: false,
    };
  }

  // Volunteers: two roles, three accepted applications (one without a role)
  // and one still pending, which the page must not count.
  await database
    .insert(volunteerRoles)
    .values(
      ROLE_NAMES.map((name, index) => ({
        festivalId: festival.id,
        name,
        description: "Rol de ejemplo para las credenciales",
        sortOrder: 100 + index,
      })),
    )
    .onConflictDoNothing();
  const roles = await database
    .select({ id: volunteerRoles.id, name: volunteerRoles.name })
    .from(volunteerRoles)
    .where(
      and(
        eq(volunteerRoles.festivalId, festival.id),
        inArray(volunteerRoles.name, [...ROLE_NAMES]),
      ),
    );
  const roleId = (index: number) =>
    roles.find((role) => role.name === ROLE_NAMES[index])!.id;
  const inserted = await database
    .insert(volunteerApplications)
    .values(
      VOLUNTEERS.map((volunteer) => ({
        festivalId: festival.id,
        fullName: volunteer.fullName,
        birthdate: "2001-04-12",
        phone: "+59170000000",
        email: volunteer.email,
        firstChoiceRoleId: roleId(0),
        secondChoiceRoleId: roleId(1),
        motivation: "Quiero ayudar en el festival.",
        emergencyContactName: "Contacto de ejemplo",
        emergencyContactPhone: "+59170000001",
        referralSource: "friends" as const,
        consentedAt: new Date(),
        privacyNoticeVersion: "seed",
        status: volunteer.status,
        assignedRoleId: volunteer.role == null ? null : roleId(volunteer.role),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: volunteerApplications.id });

  // An external participant on a stand of its own. All or nothing: a stand
  // membership left without its participant would read as taken on the next
  // run and never be repaired.
  const createdExternal = await database.transaction(async (tx) => {
    const claimed = await claimFixtureStands(tx, festival.id, [EXTERNAL_STAND]);
    if (!claimed) return false;
    const externalStand = claimed[0]!;
    const [existingExternal] = await tx
      .select({ id: externalParticipants.id })
      .from(externalParticipants)
      .where(eq(externalParticipants.displayName, EXTERNAL_NAME))
      .limit(1);
    const externalId =
      existingExternal?.id ??
      (
        await tx
          .insert(externalParticipants)
          .values({ displayName: EXTERNAL_NAME, type: "social_organization" })
          .returning({ id: externalParticipants.id })
      )[0]!.id;
    const [reservation] = await tx
      .insert(standReservations)
      .values({
        festivalId: festival.id,
        standId: externalStand,
        status: "accepted",
        source: "admin_assignment",
        ownerUserId: null,
      })
      .returning({ id: standReservations.id });
    await tx
      .insert(standReservationStands)
      .values({ reservationId: reservation!.id, standId: externalStand, position: 0 });
    await tx
      .insert(reservationExternalParticipants)
      .values({ reservationId: reservation!.id, externalParticipantId: externalId });
    return true;
  });

  // A reservation holding two stands, for the demo illustrator.
  let createdFullTable = false;
  const [participant] = await database
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, fullTableEmails()))
    .limit(1);
  if (participant) {
    createdFullTable = await database.transaction(async (tx) => {
      const standIds = await claimFixtureStands(tx, festival.id, FULL_TABLE_STANDS);
      if (!standIds) return false;
      const [reservation] = await tx
        .insert(standReservations)
        .values({
          festivalId: festival.id,
          standId: standIds[0]!,
          status: "accepted",
          source: "admin_assignment",
          ownerUserId: participant.id,
        })
        .returning({ id: standReservations.id });
      await tx.insert(standReservationStands).values(
        standIds.map((standId, position) => ({
          reservationId: reservation!.id,
          standId,
          position,
        })),
      );
      await tx
        .insert(reservationParticipants)
        .values({ reservationId: reservation!.id, userId: participant.id })
        .onConflictDoNothing();
      return true;
    });
  }

  // Two people of the Glitter team, selected for this festival, and a lot
  // of unnamed one-off credentials.
  let createdStaff = 0;
  for (const member of STAFF) {
    const [existing] = await database
      .select({ id: staffMembers.id })
      .from(staffMembers)
      .where(eq(staffMembers.fullName, member.fullName))
      .limit(1);
    const staffMemberId =
      existing?.id ??
      (await database.insert(staffMembers).values(member).returning({ id: staffMembers.id }))[0]!
        .id;
    if (!existing) createdStaff += 1;
    await database
      .insert(festivalStaffMembers)
      .values({ festivalId: festival.id, staffMemberId })
      .onConflictDoNothing();
  }
  const [existingExtra] = await database
    .select({ id: festivalExtraCredentials.id })
    .from(festivalExtraCredentials)
    .where(
      and(
        eq(festivalExtraCredentials.festivalId, festival.id),
        eq(festivalExtraCredentials.label, EXTRA_LABEL),
      ),
    )
    .limit(1);
  if (!existingExtra) {
    await database
      .insert(festivalExtraCredentials)
      .values({ festivalId: festival.id, name: null, label: EXTRA_LABEL, quantity: 6 });
  }

  // One print batch, so the page shows printed and new credentials side by
  // side: the demo external participant, the first demo volunteer and the
  // first team member, each at its default entitlement.
  let createdBatch = false;
  const [anyBatch] = await database
    .select({ id: credentialPrintBatches.id })
    .from(credentialPrintBatches)
    .where(eq(credentialPrintBatches.festivalId, festival.id))
    .limit(1);
  if (!anyBatch) {
    const [external] = await database
      .select({ id: externalParticipants.id })
      .from(externalParticipants)
      .innerJoin(
        reservationExternalParticipants,
        eq(reservationExternalParticipants.externalParticipantId, externalParticipants.id),
      )
      .innerJoin(
        standReservations,
        eq(standReservations.id, reservationExternalParticipants.reservationId),
      )
      .where(
        and(
          eq(externalParticipants.displayName, EXTERNAL_NAME),
          eq(standReservations.festivalId, festival.id),
        ),
      )
      .limit(1);
    // The role it has now, not the one the fixture first gave it: the
    // application may predate this seed or have been edited since.
    const [volunteer] = await database
      .select({
        id: volunteerApplications.id,
        fullName: volunteerApplications.fullName,
        roleName: volunteerRoles.name,
      })
      .from(volunteerApplications)
      .leftJoin(
        volunteerRoles,
        and(
          eq(volunteerRoles.id, volunteerApplications.assignedRoleId),
          eq(volunteerRoles.festivalId, volunteerApplications.festivalId),
        ),
      )
      .where(
        and(
          eq(volunteerApplications.festivalId, festival.id),
          eq(volunteerApplications.email, VOLUNTEERS[0].email),
        ),
      )
      .limit(1);
    const [member] = await database
      .select({ id: staffMembers.id, fullName: staffMembers.fullName, roleLabel: staffMembers.roleLabel })
      .from(staffMembers)
      .where(eq(staffMembers.fullName, STAFF[0].fullName))
      .limit(1);
    const items = [
      external && {
        unitKey: `external:${external.id}`,
        group: "external" as const,
        printedName: EXTERNAL_NAME,
        detail: `${STAND_LABEL}${EXTERNAL_STAND}`,
        namedCount: DEFAULT_CREDENTIAL_RULES.external.quantity,
      },
      volunteer && {
        unitKey: `volunteer:${volunteer.id}`,
        group: "volunteer" as const,
        printedName: volunteer.fullName,
        // The calculator's detail for a volunteer (calculate.ts).
        detail: volunteer.roleName ?? CREDENTIALS_COPY.noRole,
        namedCount: DEFAULT_CREDENTIAL_RULES.volunteer.quantity,
      },
      member && {
        unitKey: `staff:${member.id}`,
        group: "staff" as const,
        printedName: member.fullName,
        detail: member.roleLabel,
        namedCount: DEFAULT_CREDENTIAL_RULES.staff.quantity,
      },
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (items.length > 0) {
      // One transaction: a batch without items would stop a rerun from retrying.
      await database.transaction(async (tx) => {
        const [batch] = await tx
          .insert(credentialPrintBatches)
          .values({
            festivalId: festival.id,
            note: "Lote de ejemplo",
            rules: DEFAULT_CREDENTIAL_RULES,
          })
          .returning({ id: credentialPrintBatches.id });
        await tx.insert(credentialPrintBatchItems).values(
          items.map((item) => ({
            ...item,
            batchId: batch!.id,
            festivalId: festival.id,
            unnamedCount: 0,
          })),
        );
      });
      createdBatch = true;
    }
  }

  return {
    festival: festival.name,
    createdBatch,
    createdVolunteers: inserted.length,
    createdExternal,
    createdFullTable,
    createdStaff,
    createdExtra: !existingExtra,
  };
}
