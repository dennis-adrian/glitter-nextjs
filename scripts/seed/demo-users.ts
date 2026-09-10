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
  /**
   * Where the app sends mail. Derived from `SEED_DEMO_EMAIL_BASE`; set it to a
   * real inbox when notifications need to be read.
   */
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

/** Env bag used by seed helpers so unit tests can pass partial objects. */
export type SeedEnv = Readonly<Record<string, string | undefined>>;

/**
 * Fallback inbox for app notifications. Deliberately undeliverable: `.test` is
 * reserved (RFC 2606), so an unconfigured seed can never mail a real person.
 * Point `SEED_DEMO_EMAIL_BASE` at a readable inbox to receive demo mail.
 */
export const DEFAULT_SEED_DEMO_EMAIL_BASE = "glitter-demo@example.test";

export function resolveSeedDemoEmailBase(env: SeedEnv = process.env): string {
  const fromEnv = env.SEED_DEMO_EMAIL_BASE?.trim();
  return fromEnv && fromEnv.includes("@")
    ? fromEnv
    : DEFAULT_SEED_DEMO_EMAIL_BASE;
}

/** Per-role subaddress of the notification base, e.g. `base+admin@example.test`. */
export function seedDemoEmail(tag: string, env: SeedEnv = process.env): string {
  const base = resolveSeedDemoEmailBase(env);
  const at = base.lastIndexOf("@");
  return `${base.slice(0, at)}+${tag}@${base.slice(at + 1)}`;
}

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
    email: seedDemoEmail("admin"),
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
    email: seedDemoEmail("festival_admin"),
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
    email: seedDemoEmail("illustration"),
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
    email: seedDemoEmail("gastronomy"),
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
    email: seedDemoEmail("entrepreneurship"),
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
    email: seedDemoEmail("pending"),
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

export function resolveSeedDemoPassword(env: SeedEnv = process.env): string {
  const fromEnv = env.SEED_DEMO_PASSWORD?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SEED_DEMO_PASSWORD;
}

export type SeedGateResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Where a dev seed is allowed to write. Anything else is somebody's data.
 *
 * `[::1]` carries its brackets because that is what WHATWG URL parsing returns
 * for an IPv6 literal.
 */
const LOCAL_DB_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Refuses a seed aimed at a database that is not on this machine.
 *
 * The checks above this one look at credentials and at the runtime, and a
 * Railway database reached with test Clerk keys from a local shell passes both
 * — which is the exact combination someone has when they mean to seed and have
 * `.env.local` pointed somewhere else. `POSTGRES_URL` has no fixed target in
 * this project, so the host is the only thing that says what is about to be
 * written to.
 *
 * An unset URL is allowed through: every caller refuses to run without one
 * before it reaches the gate, so there is no target to judge.
 *
 * Both the caller's env and `process.env` are checked, because they can differ
 * and only one of them is real: the `@/db` singleton connects with
 * `process.env.POSTGRES_URL` whatever bag was handed to this function. A gate
 * that trusted the argument alone would approve an injected local URL while the
 * write went somewhere else. If the two disagree, that disagreement is itself
 * the thing worth stopping on.
 */
function checkSeedTargetUrl(url: string): SeedGateResult {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return {
      allowed: false,
      reason:
        "POSTGRES_URL could not be parsed, so the seed target is unknown.",
    };
  }

  if (LOCAL_DB_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      `Refusing to seed the database at ${hostname}: it is not local. ` +
      "Set ALLOW_REMOTE_DEV_SEED=true only if you are certain it is disposable.",
  };
}

function getSeedTargetGate(env: SeedEnv): SeedGateResult {
  if (env.ALLOW_REMOTE_DEV_SEED === "true") return { allowed: true };

  const urls = new Set(
    [env.POSTGRES_URL, process.env.POSTGRES_URL]
      .map((url) => url?.trim())
      .filter((url): url is string => Boolean(url)),
  );

  for (const url of urls) {
    const result = checkSeedTargetUrl(url);
    if (!result.allowed) return result;
  }

  return { allowed: true };
}

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

  const target = getSeedTargetGate(env);
  if (!target.allowed) return target;

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
