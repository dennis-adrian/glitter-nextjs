import { and, desc, eq, inArray } from "drizzle-orm";

import type { db as DbType } from "@/db";
import {
  externalParticipants,
  festivals,
  reservationExternalParticipants,
  reservationParticipants,
  standReservations,
  standReservationStands,
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

export type SeedCredentialsResult = {
  festival: string | null;
  createdVolunteers: number;
  createdExternal: boolean;
  createdFullTable: boolean;
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
    return { festival: null, createdVolunteers: 0, createdExternal: false, createdFullTable: false };
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

  return {
    festival: festival.name,
    createdVolunteers: inserted.length,
    createdExternal,
    createdFullTable,
  };
}
