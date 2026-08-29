// @vitest-environment node

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { revalidatePath } from "next/cache";

import * as schema from "@/db/schema";
import { festivals } from "@/db/schema";

const requireAdminOrFestivalAdmin = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin,
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
    return /(^|[_-])(test|ci)([_-]|$)/i.test(databaseName);
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

let updateFestivalParticipantTerms: (typeof import("@/app/lib/festivals/actions"))["updateFestivalParticipantTerms"];

const festivalIds: number[] = [];

describeDatabase("festival participant terms actions", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ updateFestivalParticipantTerms } = await import(
      "@/app/lib/festivals/actions"
    ));

    const result = await pool!.query<{ festivals: string | null }>(
      "select to_regclass('public.festivals')::text as festivals",
    );
    if (!result.rows[0]?.festivals) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  afterEach(async () => {
    requireAdminOrFestivalAdmin.mockReset();
    vi.mocked(revalidatePath).mockClear();
    const db = integrationDb!;
    const leftover = festivalIds.splice(0);
    for (const festivalId of leftover) {
      await db.delete(festivals).where(eq(festivals.id, festivalId));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("rejects unauthorized callers and leaves the festival unchanged", async () => {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Participant Terms Auth ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: false,
      })
      .returning();
    festivalIds.push(festival.id);

    requireAdminOrFestivalAdmin.mockResolvedValue(null);

    const result = await updateFestivalParticipantTerms(festival.id, true);

    expect(result).toEqual({ success: false, message: "No autorizado" });

    const unchanged = await db.query.festivals.findFirst({
      where: eq(festivals.id, festival.id),
      columns: { participantTermsEnabled: true },
    });
    expect(unchanged?.participantTermsEnabled).toBe(false);
  });

  it("returns an error when no festival matches without revalidating", async () => {
    requireAdminOrFestivalAdmin.mockResolvedValue({
      id: 1,
      role: "admin",
    });

    const result = await updateFestivalParticipantTerms(2_147_483_647, true);

    expect(result).toEqual({
      success: false,
      message: "Festival no encontrado",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("updates participantTermsEnabled when the festival exists", async () => {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Participant Terms Update ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: false,
      })
      .returning();
    festivalIds.push(festival.id);

    requireAdminOrFestivalAdmin.mockResolvedValue({
      id: 1,
      role: "admin",
    });

    const result = await updateFestivalParticipantTerms(festival.id, true);

    expect(result).toEqual({
      success: true,
      message:
        "Los participantes ya pueden acceder a los términos y condiciones",
    });

    const updated = await db.query.festivals.findFirst({
      where: eq(festivals.id, festival.id),
      columns: { participantTermsEnabled: true },
    });
    expect(updated?.participantTermsEnabled).toBe(true);
    expect(revalidatePath).toHaveBeenCalled();
  });
});
