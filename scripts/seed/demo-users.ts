import { createClerkClient, type User } from "@clerk/backend";
import { eq } from "drizzle-orm";

import type { db as DbType } from "@/db";
import { users } from "@/db/schema";

export type DemoUserRole = "admin" | "festival_admin" | "artist" | "user";
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
  email: string;
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
 */
export const DEMO_USERS: readonly DemoUserSeed[] = [
  {
    key: "admin",
    email: "admin+clerk_test@example.com",
    firstName: "Admin",
    lastName: "Glitter",
    displayName: "Admin Glitter",
    role: "admin",
    status: "verified",
    category: "none",
  },
  {
    key: "festival_admin",
    email: "festival-admin+clerk_test@example.com",
    firstName: "Festival",
    lastName: "Admin",
    displayName: "Festival Admin",
    role: "festival_admin",
    status: "verified",
    category: "none",
  },
  {
    key: "artist",
    email: "artist+clerk_test@example.com",
    firstName: "Artist",
    lastName: "Demo",
    displayName: "Artist Demo",
    role: "artist",
    status: "verified",
    category: "illustration",
  },
  {
    key: "pending_user",
    email: "pending+clerk_test@example.com",
    firstName: "Pending",
    lastName: "User",
    displayName: "Pending User",
    role: "user",
    status: "pending",
    category: "none",
  },
] as const;

/** Default password for local/cloud-agent login when SEED_DEMO_PASSWORD is unset. */
export const DEFAULT_SEED_DEMO_PASSWORD = "Glitter-Dev-Seed-1!";

export function resolveSeedDemoPassword(
  env: NodeJS.ProcessEnv = process.env,
): string {
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
export function getDevSeedGate(
  env: NodeJS.ProcessEnv = process.env,
): SeedGateResult {
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
  const existing = await findClerkUserByEmail(client, demo.email);
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
    emailAddress: [demo.email],
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
  env: NodeJS.ProcessEnv = process.env,
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

  for (const demo of DEMO_USERS) {
    const { user, created } = await ensureClerkUser(client, demo, password);
    const local = await upsertLocalProfile(db, demo, user.id);
    if (!local?.id) {
      throw new Error(`Failed to upsert local profile for ${demo.email}`);
    }
    results.push({
      key: demo.key,
      email: demo.email,
      clerkId: user.id,
      clerk: created ? "created" : "updated",
      localUserId: local.id,
    });
    console.info(
      `[seed] ${demo.key}: clerk=${created ? "created" : "updated"} id=${user.id} localUserId=${local.id}`,
    );
  }

  return {
    passwordSource: passwordFromEnv ? "env" : "default",
    users: results,
  };
}
