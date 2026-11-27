import {
  addExternal,
  addReservation,
  batch,
  emptyData,
} from "@/app/lib/credentials/__fixtures__/data";
import type { CredentialsData } from "@/app/lib/credentials/calculate";

/**
 * A festival for the credentials stories: shared and full-table stands,
 * long names, a reservation in each status, externals, volunteers with and
 * without a role, the team, one-off entries and a print batch from which
 * some reservations were cancelled or grew. Illustrative only.
 */
export function credentialsSample(): CredentialsData {
  const data = emptyData();
  data.festival = { id: 11, name: "Glitter Navidad 2026 — Edición de verano en el Teatro Municipal" };

  const camila = addReservation(data, {
    people: [{ name: "Camila Rojas", participationId: 1 }],
    label: "A",
    firstNumber: 12,
  });
  addReservation(data, {
    people: [
      { name: "Estudio Tinta Negra", participationId: 2 },
      { name: "Valeria Mendoza", participationId: 3 },
    ],
    label: "A",
    firstNumber: 13,
  });
  const fullTable = addReservation(data, {
    people: [{ name: "Diego Quispe", participationId: 4 }],
    stands: 2,
    label: "A",
    firstNumber: 14,
  });
  addReservation(data, {
    people: [{ name: "Lucía Fernández Arancibia de la Fuente y Mamani", participationId: 5 }],
    label: "B",
    firstNumber: 3,
  });
  addReservation(data, {
    people: [
      { name: "Mar de Papel", participationId: 6 },
      { name: "Andrés Vaca", participationId: 7 },
    ],
    label: "B",
    firstNumber: 4,
  });
  addReservation(data, {
    people: [{ name: "Paola Gutiérrez", participationId: 8 }],
    status: "verification_payment",
    label: "B",
    firstNumber: 7,
  });
  addReservation(data, {
    people: [{ name: "Sebastián Loza", participationId: 9 }],
    status: "pending",
    label: "C",
    firstNumber: 2,
  });
  addReservation(data, {
    category: "entrepreneurship",
    people: [{ name: "Taller Amaranto", participationId: 10 }],
    label: "E",
    firstNumber: 11,
  });
  addReservation(data, {
    category: "gastronomy",
    people: [{ name: "Sabores del Valle", participationId: 11 }],
    label: "G",
    firstNumber: 2,
  });
  addExternal(data, { externalId: 21, name: "Refugio Huellitas" });
  addExternal(data, { externalId: 22, name: "Alcaldía Municipal de La Paz", stands: 2 });
  data.externalOverrides.push({ externalParticipantId: 21, quantity: 3, standsAtOverride: 1 });

  data.volunteers.push(
    { applicationId: 31, fullName: "Valentina Ríos", roleName: "Orientación al público" },
    { applicationId: 32, fullName: "Camila Rojas Quiroga", roleName: "Acreditación" },
    { applicationId: 33, fullName: "Joaquín Paz", roleName: null },
  );
  data.volunteerCounts = { accepted: 3, withoutRole: 1, waiting: 7 };
  data.staff.push(
    { id: 41, fullName: "Daniela Arce", roleLabel: "Dirección", isActive: true, selected: true },
    { id: 42, fullName: "Rodrigo Molina", roleLabel: "Producción", isActive: true, selected: true },
    {
      id: 43,
      fullName: "Fernanda Ibáñez",
      roleLabel: "Coordinación de participantes",
      isActive: true,
      selected: true,
    },
    { id: 44, fullName: "Pablo Terán", roleLabel: "Sonido", isActive: true, selected: false },
    { id: 45, fullName: "Carla Montaño", roleLabel: "Diseño", isActive: false, selected: true },
  );
  data.extras.push(
    { id: 51, name: "Marcelo Peredo", label: "Fotografía", quantity: 1 },
    { id: 52, name: null, label: "Prensa", quantity: 6 },
  );

  const item = (
    unitKey: string,
    printedName: string | null,
    namedCount: number,
    unnamedCount: number,
    group: "illustration" | "staff" = "illustration",
  ) => ({
    unitKey,
    group,
    userId: null,
    printedName,
    detail: "",
    namedCount,
    unnamedCount,
    isReprint: false,
  });
  data.batches.push(
    batch(
      [
        item("participant:1", "Camila Rojas", 1, 0),
        item(`reservation:${camila.reservationId}`, null, 0, 1),
        item("participant:2", "Estudio Tinta Negra", 1, 0),
        item("participant:3", "Valeria Mendoza", 1, 0),
        item("participant:4", "Diego Quispe", 1, 0),
        // One full table printed when it had a single stand: two are missing.
        item(`reservation:${fullTable.reservationId}`, null, 0, 1),
        // A reservation cancelled after printing.
        item("participant:99", "Renata Soliz", 1, 0),
        item("staff:41", "Daniela Arce", 1, 0, "staff"),
      ],
      new Date("2026-11-14T15:00:00Z"),
      901,
    ),
  );
  return data;
}
