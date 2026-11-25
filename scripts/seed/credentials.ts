import { and, desc, eq, inArray } from "drizzle-orm";

import { DEFAULT_CREDENTIAL_RULES } from "@/app/lib/credentials/definitions";
import type { db as DbType } from "@/db";
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
 * most recent festival, idempotent: every row is found by a fixed name,
 * email or stand number before it is created, so re-running adds only what
 * is missing.
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
const FULL_TABLE_EMAIL = "illustration+clerk_test@example.com";
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

async function ensureStand(
  database: typeof DbType,
  festivalId: number,
  standNumber: number,
): Promise<number> {
  const [existing] = await database
    .select({ id: stands.id })
    .from(stands)
    .where(
      and(
        eq(stands.festivalId, festivalId),
        eq(stands.label, STAND_LABEL),
        eq(stands.standNumber, standNumber),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [created] = await database
    .insert(stands)
    .values({
      festivalId,
      label: STAND_LABEL,
      standNumber,
      standCategory: "illustration",
      status: "reserved",
    })
    .returning({ id: stands.id });
  return created!.id;
}

/** Whether any reservation of the festival already holds one of these stands. */
async function standsTaken(database: typeof DbType, standIds: number[]) {
  const rows = await database
    .select({ id: standReservationStands.id })
    .from(standReservationStands)
    .where(inArray(standReservationStands.standId, standIds))
    .limit(1);
  return rows.length > 0;
}

export async function seedCredentials(
  database: typeof DbType,
): Promise<SeedCredentialsResult> {
  const [festival] = await database
    .select({ id: festivals.id, name: festivals.name })
    .from(festivals)
    .orderBy(desc(festivals.id))
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

  // An external participant on a stand of its own.
  let createdExternal = false;
  const externalStand = await ensureStand(database, festival.id, EXTERNAL_STAND);
  if (!(await standsTaken(database, [externalStand]))) {
    const [existingExternal] = await database
      .select({ id: externalParticipants.id })
      .from(externalParticipants)
      .where(eq(externalParticipants.displayName, EXTERNAL_NAME))
      .limit(1);
    const externalId =
      existingExternal?.id ??
      (
        await database
          .insert(externalParticipants)
          .values({ displayName: EXTERNAL_NAME, type: "social_organization" })
          .returning({ id: externalParticipants.id })
      )[0]!.id;
    const [reservation] = await database
      .insert(standReservations)
      .values({
        festivalId: festival.id,
        standId: externalStand,
        status: "accepted",
        source: "admin_assignment",
        ownerUserId: null,
      })
      .returning({ id: standReservations.id });
    await database
      .insert(standReservationStands)
      .values({ reservationId: reservation!.id, standId: externalStand, position: 0 });
    await database
      .insert(reservationExternalParticipants)
      .values({ reservationId: reservation!.id, externalParticipantId: externalId });
    createdExternal = true;
  }

  // A reservation holding two stands, for the demo illustrator.
  let createdFullTable = false;
  const [participant] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, FULL_TABLE_EMAIL))
    .limit(1);
  if (participant) {
    const standIds = [];
    for (const number of FULL_TABLE_STANDS) {
      standIds.push(await ensureStand(database, festival.id, number));
    }
    if (!(await standsTaken(database, standIds))) {
      const [reservation] = await database
        .insert(standReservations)
        .values({
          festivalId: festival.id,
          standId: standIds[0]!,
          status: "accepted",
          source: "admin_assignment",
          ownerUserId: participant.id,
        })
        .returning({ id: standReservations.id });
      await database.insert(standReservationStands).values(
        standIds.map((standId, position) => ({
          reservationId: reservation!.id,
          standId,
          position,
        })),
      );
      await database
        .insert(reservationParticipants)
        .values({ reservationId: reservation!.id, userId: participant.id })
        .onConflictDoNothing();
      createdFullTable = true;
    }
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
    const [volunteer] = await database
      .select({ id: volunteerApplications.id, fullName: volunteerApplications.fullName })
      .from(volunteerApplications)
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
        detail: ROLE_NAMES[0],
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
      const [batch] = await database
        .insert(credentialPrintBatches)
        .values({
          festivalId: festival.id,
          note: "Lote de ejemplo",
          rules: DEFAULT_CREDENTIAL_RULES,
        })
        .returning({ id: credentialPrintBatches.id });
      await database.insert(credentialPrintBatchItems).values(
        items.map((item) => ({
          ...item,
          batchId: batch!.id,
          festivalId: festival.id,
          unnamedCount: 0,
        })),
      );
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
