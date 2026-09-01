/** Categories that have self-service reservation sectors in the demo festival. */
export type SeedParticipantCategory =
  | "illustration"
  | "gastronomy"
  | "entrepreneurship";

/** Stable festival name used as the idempotency key for the hardening fixture. */
export const DEMO_FESTIVAL_NAME = "Glitter Demo";

export const STANDS_PER_SECTOR = 12;
export const STAND_GRID_COLUMNS = 4;
export const STAND_CELL_SIZE = 10;
export const STAND_ORIGIN_LEFT = 8;
export const STAND_ORIGIN_TOP = 10;
export const STAND_SIZE = 6;

export type SeedStandRole =
  | "available"
  | "reserved_visible"
  | "reserved_hidden"
  | "disabled"
  | "stale_held"
  | "joint";

export type SeedSectorPlan = {
  name: string;
  category: SeedParticipantCategory;
  orderInFestival: number;
  label: string;
  price: number;
};

export const DEMO_SECTORS: readonly SeedSectorPlan[] = [
  {
    name: "Ilustración",
    category: "illustration",
    orderInFestival: 1,
    label: "A",
    price: 350,
  },
  {
    name: "Gastronomía",
    category: "gastronomy",
    orderInFestival: 2,
    label: "G",
    price: 500,
  },
  {
    name: "Emprendimiento",
    category: "entrepreneurship",
    orderInFestival: 3,
    label: "E",
    price: 400,
  },
] as const;

/**
 * Local-only profiles (no Clerk). They occupy reserved stands, own the stale
 * hold, and carry email/phone so map DTO privacy scans have something to leak.
 */
export type LocalSeedUser = {
  key: string;
  clerkId: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  category: SeedParticipantCategory;
  phoneNumber: string;
};

export const LOCAL_SEED_USERS: readonly LocalSeedUser[] = [
  {
    key: "illustration_visible",
    clerkId: "seed:illustration-visible",
    email: "illustration-visible+seed@example.test",
    displayName: "Ocupante Visible",
    firstName: "Ocupante",
    lastName: "Visible",
    category: "illustration",
    phoneNumber: "+59170000001",
  },
  {
    key: "illustration_hidden",
    clerkId: "seed:illustration-hidden",
    email: "illustration-hidden+seed@example.test",
    displayName: "Ocupante Oculto",
    firstName: "Ocupante",
    lastName: "Oculto",
    category: "illustration",
    phoneNumber: "+59170000002",
  },
  {
    key: "gastronomy_visible",
    clerkId: "seed:gastronomy-visible",
    email: "gastronomy-visible+seed@example.test",
    displayName: "Ocupante Gastronomía",
    firstName: "Ocupante",
    lastName: "Gastronomia",
    category: "gastronomy",
    phoneNumber: "+59170000003",
  },
  {
    key: "entrepreneurship_visible",
    clerkId: "seed:entrepreneurship-visible",
    email: "entrepreneurship-visible+seed@example.test",
    displayName: "Ocupante Emprendimiento",
    firstName: "Ocupante",
    lastName: "Emprendimiento",
    category: "entrepreneurship",
    phoneNumber: "+59170000004",
  },
  {
    key: "expired_hold",
    clerkId: "seed:expired-hold",
    email: "expired-hold+seed@example.test",
    displayName: "Hold Expirado",
    firstName: "Hold",
    lastName: "Expirado",
    category: "illustration",
    phoneNumber: "+59170000005",
  },
] as const;

export const ENROLLED_DEMO_USER_KEYS = [
  "illustration_participant",
  "illustration_partner",
  "gastronomy_participant",
  "entrepreneurship_participant",
] as const;

export function seedStandPosition(standNumber: number): {
  positionLeft: number;
  positionTop: number;
} {
  const index = standNumber - 1;
  const column = index % STAND_GRID_COLUMNS;
  const row = Math.floor(index / STAND_GRID_COLUMNS);
  return {
    positionLeft: STAND_ORIGIN_LEFT + column * STAND_CELL_SIZE,
    positionTop: STAND_ORIGIN_TOP + row * STAND_CELL_SIZE,
  };
}

export function seedStandRole(
  category: SeedSectorPlan["category"],
  standNumber: number,
): SeedStandRole {
  if (standNumber === 1) return "reserved_visible";
  if (standNumber === 3) return "disabled";
  if (category !== "illustration") return "available";
  if (standNumber === 2) return "reserved_hidden";
  if (standNumber === 4) return "stale_held";
  if (standNumber === 5 || standNumber === 6) return "joint";
  return "available";
}

export function seedStandStoredStatus(
  role: SeedStandRole,
): "available" | "reserved" | "disabled" | "held" {
  switch (role) {
    case "reserved_visible":
    case "reserved_hidden":
      return "reserved";
    case "disabled":
      return "disabled";
    case "stale_held":
      return "held";
    default:
      return "available";
  }
}

export function sectorMapBounds() {
  const last = seedStandPosition(STANDS_PER_SECTOR);
  return {
    mapOriginX: 0,
    mapOriginY: 0,
    mapWidth: last.positionLeft + STAND_SIZE + STAND_ORIGIN_LEFT,
    mapHeight: last.positionTop + STAND_SIZE + STAND_ORIGIN_TOP,
  };
}
