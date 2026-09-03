import { createClerkClient, type User } from "@clerk/backend";
import { and, eq, inArray } from "drizzle-orm";

import type { db as DbType } from "@/db";
import { profileSubcategories, subcategories, users } from "@/db/schema";

/** Roles used by the seed. Omits unused `artist` (zero prod users; pending cleanup). */
export type DemoUserRole = "admin" | "festival_admin" | "user";
export type DemoUserStatus = "verified" | "pending";
export type DemoUserCategory =
  | "none"
  | "illustration"
  | "gastronomy"
  | "entrepreneurship"
  | "new_artist";

export type DemoUserSeed = {
  /** Stable key for logs; not stored. */
  key: string;
  /** Where the app sends mail. A real inbox, so notifications can be read. */
  email: string;
  /**
   * The address Clerk knows. Kept on `+clerk_test` so sign-in keeps Clerk's
   * fixed test code instead of mailing a real one-time password; the app's own
   * notifications go to `email` above, which Clerk never sees.
   */
  clerkEmail: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: DemoUserRole;
  status: DemoUserStatus;
  category: DemoUserCategory;
};

/**
 * Dev-only demo accounts. Emails use Clerk's `+clerk_test` subaddress so OTP
 * verification uses the fixed code `424242` on development instances.
 *
 * Verified participants use role `user` plus a festival `category` — matching
 * production, where the `artist` role is unused.
 */
export const DEMO_USERS: readonly DemoUserSeed[] = [
  {
    key: "admin",
    email: "dennisguzmanbo+admin@gmail.com",
    clerkEmail: "admin+clerk_test@example.com",
    firstName: "Admin",
    lastName: "Glitter",
    displayName: "Admin Glitter",
    role: "admin",
    status: "verified",
    category: "none",
  },
  {
    key: "festival_admin",
    email: "dennisguzmanbo+festival_admin@gmail.com",
    clerkEmail: "festival-admin+clerk_test@example.com",
    firstName: "Festival",
    lastName: "Admin",
    displayName: "Festival Admin",
    role: "festival_admin",
    status: "verified",
    category: "none",
  },
  {
    key: "illustration_participant",
    email: "dennisguzmanbo+illustration@gmail.com",
    clerkEmail: "illustration+clerk_test@example.com",
    firstName: "Ilustracion",
    lastName: "Demo",
    displayName: "Ilustración Demo",
    role: "user",
    status: "verified",
    category: "illustration",
  },
  {
    key: "gastronomy_participant",
    email: "dennisguzmanbo+gastronomy@gmail.com",
    clerkEmail: "gastronomy+clerk_test@example.com",
    firstName: "Gastronomia",
    lastName: "Demo",
    displayName: "Gastronomía Demo",
    role: "user",
    status: "verified",
    category: "gastronomy",
  },
  {
    key: "entrepreneurship_participant",
    email: "dennisguzmanbo+entrepreneurship@gmail.com",
    clerkEmail: "entrepreneurship+clerk_test@example.com",
    firstName: "Emprendimiento",
    lastName: "Demo",
    displayName: "Emprendimiento Demo",
    role: "user",
    status: "verified",
    category: "entrepreneurship",
  },
  {
    key: "pending_user",
    email: "dennisguzmanbo+pending@gmail.com",
    clerkEmail: "pending+clerk_test@example.com",
    firstName: "Pending",
    lastName: "User",
    displayName: "Pending User",
    role: "user",
    status: "pending",
    category: "none",
  },
  // `new_artist` category and `artist` role are unused / pending cleanup; not seeded.
] as const;

/**
 * Former demo emails removed from DEMO_USERS. Deleted on each seed run so local
 * DBs and the shared Clerk development instance stay aligned with the current list.
 */
export const RETIRED_DEMO_EMAILS = ["artist+clerk_test@example.com"] as const;

/** Default password for local/cloud-agent login when SEED_DEMO_PASSWORD is unset. */
export const DEFAULT_SEED_DEMO_PASSWORD = "Glitter-Dev-Seed-1!";

/** Env bag used by seed helpers so unit tests can pass partial objects. */
export type SeedEnv = Readonly<Record<string, string | undefined>>;

export function resolveSeedDemoPassword(env: SeedEnv = process.env): string {
  const fromEnv = env.SEED_DEMO_PASSWORD?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SEED_DEMO_PASSWORD;
}

export type SeedGateResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Only allow seeding against a Clerk *development* secret key and a non-production
 * runtime. Preview/production Vercel deploys and live Clerk keys are refused.
 */
export function getDevSeedGate(env: SeedEnv = process.env): SeedGateResult {
  const clerkSecret = env.CLERK_SECRET_KEY?.trim() ?? "";
  if (!clerkSecret) {
    return { allowed: false, reason: "CLERK_SECRET_KEY is not set." };
  }
  if (clerkSecret.startsWith("sk_live_")) {
    return {
      allowed: false,
      reason: "Refusing to seed against a live Clerk secret key (sk_live_).",
    };
  }
  if (!clerkSecret.startsWith("sk_test_")) {
    return {
      allowed: false,
      reason: "CLERK_SECRET_KEY must be a development key (sk_test_...).",
    };
  }

  if (env.VERCEL_ENV === "production" || env.NODE_ENV === "production") {
    return {
      allowed: false,
      reason: "Refusing to seed when VERCEL_ENV/NODE_ENV is production.",
    };
  }

  if (env.ALLOW_DEV_SEED === "false") {
    return { allowed: false, reason: "ALLOW_DEV_SEED=false." };
  }

  return { allowed: true };
}

async function findClerkUserByEmail(
  client: ReturnType<typeof createClerkClient>,
  email: string,
): Promise<User | null> {
  const { data } = await client.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  return data[0] ?? null;
}

async function ensureClerkUser(
  client: ReturnType<typeof createClerkClient>,
  demo: DemoUserSeed,
  password: string,
): Promise<{ user: User; created: boolean }> {
  const existing = await findClerkUserByEmail(client, demo.clerkEmail);
  if (existing) {
    // Keep password + profile fields in sync so cloud agents can always log in.
    const updated = await client.users.updateUser(existing.id, {
      firstName: demo.firstName,
      lastName: demo.lastName,
      password,
      skipPasswordChecks: true,
    });
    return { user: updated, created: false };
  }

  const created = await client.users.createUser({
    // Must match the address the lookup above uses, or the next run will not
    // find this user and will try to create it again.
    emailAddress: [demo.clerkEmail],
    firstName: demo.firstName,
    lastName: demo.lastName,
    password,
    skipPasswordChecks: true,
  });
  return { user: created, created: true };
}

async function upsertLocalProfile(
  database: typeof DbType,
  demo: DemoUserSeed,
  clerkId: string,
) {
  const verifiedAt = demo.status === "verified" ? new Date() : null;
  const sharedFields = {
    email: demo.email,
    firstName: demo.firstName,
    lastName: demo.lastName,
    displayName: demo.displayName,
    role: demo.role,
    status: demo.status,
    category: demo.category,
    verifiedAt,
    updatedAt: new Date(),
  } as const;

  const existingByClerk = await database.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (existingByClerk) {
    const [row] = await database
      .update(users)
      .set(sharedFields)
      .where(eq(users.clerkId, clerkId))
      .returning({ id: users.id, clerkId: users.clerkId, email: users.email });
    return row;
  }

  const existingByEmail = await database.query.users.findFirst({
    where: eq(users.email, demo.email),
    columns: { id: true },
  });
  if (existingByEmail) {
    const [row] = await database
      .update(users)
      .set({ ...sharedFields, clerkId })
      .where(eq(users.email, demo.email))
      .returning({ id: users.id, clerkId: users.clerkId, email: users.email });
    return row;
  }

  const [row] = await database
    .insert(users)
    .values({
      clerkId,
      country: "BO",
      ...sharedFields,
    })
    .returning({ id: users.id, clerkId: users.clerkId, email: users.email });
  return row;
}

/**
 * Gives a participant one subcategory matching their festival category.
 *
 * Not cosmetic: the festival terms page — the entry point to the whole
 * reservation flow — calls notFound() for a profile with no subcategories, so
 * a seeded participant could not reach it at all. Picks the first selectable,
 * non-admin-only subcategory for the category, and leaves any existing
 * assignment alone.
 */
async function ensureProfileSubcategory(
  database: typeof DbType,
  demo: DemoUserSeed,
  profileId: number,
): Promise<string | null> {
  if (demo.category === "none") return null;

  const existing = await database.query.profileSubcategories.findFirst({
    where: eq(profileSubcategories.profileId, profileId),
    columns: { id: true },
  });
  if (existing) return null;

  const [subcategory] = await database
    .select({ id: subcategories.id, label: subcategories.label })
    .from(subcategories)
    .where(
      and(
        eq(subcategories.category, demo.category),
        eq(subcategories.visibility, "selectable"),
        eq(subcategories.isAdminAssignableOnly, false),
      ),
    )
    .orderBy(subcategories.sortOrder, subcategories.id)
    .limit(1);

  // A database with no subcategories for this category is a valid state; the
  // seed should not fail over it.
  if (!subcategory) return null;

  await database
    .insert(profileSubcategories)
    .values({ profileId, subcategoryId: subcategory.id })
    .onConflictDoNothing();

  return subcategory.label;
}

async function retireFormerDemoUsers(
  client: ReturnType<typeof createClerkClient>,
  database: typeof DbType,
) {
  for (const email of RETIRED_DEMO_EMAILS) {
    const clerkUser = await findClerkUserByEmail(client, email);
    if (clerkUser) {
      await client.users.deleteUser(clerkUser.id);
      console.info(`[seed] retired clerk user ${email} (${clerkUser.id})`);
    }

    try {
      const deleted = await database
        .delete(users)
        .where(eq(users.email, email))
        .returning({ id: users.id });
      if (deleted.length > 0) {
        console.info(
          `[seed] retired local profile ${email} (id=${deleted[0].id})`,
        );
      }
    } catch (error) {
      console.warn(`[seed] failed to retire local profile ${email}`, error);
    }
  }
}

export type SeedDemoUsersResult = {
  passwordSource: "env" | "default";
  users: {
    key: string;
    email: string;
    clerkId: string;
    clerk: "created" | "updated";
    localUserId: number;
  }[];
};

export async function seedDemoUsers(
  env: SeedEnv = process.env,
): Promise<SeedDemoUsersResult> {
  const gate = getDevSeedGate(env);
  if (!gate.allowed) {
    throw new Error(`Dev seed blocked: ${gate.reason}`);
  }

  const { db } = await import("@/db");

  const passwordFromEnv = Boolean(env.SEED_DEMO_PASSWORD?.trim());
  const password = resolveSeedDemoPassword(env);
  const client = createClerkClient({ secretKey: env.CLERK_SECRET_KEY! });

  const results: SeedDemoUsersResult["users"] = [];

  await retireFormerDemoUsers(client, db);

  for (const demo of DEMO_USERS) {
    const { user, created } = await ensureClerkUser(client, demo, password);
    const local = await upsertLocalProfile(db, demo, user.id);
    if (!local?.id) {
      throw new Error(`Failed to upsert local profile for ${demo.email}`);
    }
    const subcategoryName = await ensureProfileSubcategory(db, demo, local.id);
    results.push({
      key: demo.key,
      email: demo.email,
      clerkId: user.id,
      clerk: created ? "created" : "updated",
      localUserId: local.id,
    });
    console.info(
      `[seed] ${demo.key}: clerk=${created ? "created" : "updated"} id=${user.id} localUserId=${local.id}` +
        (subcategoryName ? ` subcategory="${subcategoryName}"` : ""),
    );
  }

  return {
    passwordSource: passwordFromEnv ? "env" : "default",
    users: results,
  };
}
