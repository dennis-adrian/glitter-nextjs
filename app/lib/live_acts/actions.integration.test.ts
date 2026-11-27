// @vitest-environment node

import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import { liveActs } from "@/db/schema";

/**
 * The public cultural activity action against a real database, with the
 * request's network address simulated.
 */

const requestIp = vi.hoisted(() => ({ value: "203.0.113.1" }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ "x-forwarded-for": requestIp.value }),
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

type Actions = typeof import("@/app/lib/live_acts/actions");
let actions: Actions;

/** Every row this file creates carries it in its name, for cleanup. */
const MARKER = `it-cultural-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    category: "music",
    otherType: "",
    actName: `${MARKER} ${suffix()}`,
    description: "",
    resourceLink: "https://youtube.com/watch?v=1",
    socialLinks: ["https://instagram.com/glitter.bo", " "],
    workshopCapacity: "",
    spaceNeeds: "",
    relatedOffer: "",
    noCostAcknowledged: false,
    contactName: "María Pérez",
    contactEmail: "Maria.Perez@Example.TEST",
    contactPhone: "+59171234567",
    website: "",
    ...overrides,
  };
}

async function stored(actName: string) {
  return integrationDb!
    .select()
    .from(liveActs)
    .where(eq(liveActs.actName, actName));
}

const WORKSHOP_DESCRIPTION =
  "Un taller práctico de encuadernación japonesa para principiantes.";

describeDatabase("createLiveAct", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    actions = await import("@/app/lib/live_acts/actions");

    const result = await pool!.query<{ column: string | null }>(
      "select column_name as column from information_schema.columns where table_name = 'live_acts' and column_name = 'no_cost_acknowledged_at'",
    );
    if (!result.rows[0]?.column) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  beforeEach(() => {
    // Each test its own address, so rate limits never carry over.
    requestIp.value = `198.51.100.${Math.floor(Math.random() * 250) + 1}-${suffix()}`;
  });

  afterEach(async () => {
    await integrationDb!
      .delete(liveActs)
      .where(like(liveActs.actName, `${MARKER}%`));
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("stores a workshop with its own fields and the no-cost acceptance", async () => {
    const values = input({
      category: "workshop",
      description: WORKSHOP_DESCRIPTION,
      workshopCapacity: "25",
      spaceNeeds: "Mesas y enchufes",
      relatedOffer: "Curso completo de encuadernación",
      noCostAcknowledged: true,
      otherType: "No aplica",
    });
    const before = Date.now();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(actions.createLiveAct(values)).resolves.toEqual({
        success: true,
      });
      // The query log carries no applicant data (db/index.ts).
      const logged = JSON.stringify(consoleLog.mock.calls);
      expect(logged).not.toMatch(/maria|perez|59171234567/i);
    } finally {
      consoleLog.mockRestore();
    }

    const [row] = await stored(values.actName);
    expect(row).toMatchObject({
      category: "workshop",
      description: WORKSHOP_DESCRIPTION,
      workshopCapacity: 25,
      spaceNeeds: "Mesas y enchufes",
      relatedOffer: "Curso completo de encuadernación",
      otherType: null,
      contactEmail: "maria.perez@example.test",
      socialLinks: ["https://instagram.com/glitter.bo"],
      status: "pending",
      adminNotes: null,
    });
    expect(row!.noCostAcknowledgedAt).toBeInstanceOf(Date);
    expect(row!.noCostAcknowledgedAt!.getTime()).toBeGreaterThan(
      before - 60_000,
    );
  });

  it("stores the free-text type of another activity", async () => {
    const values = input({
      category: "other",
      otherType: " Feria de fanzines ",
      description: "Una feria de trueque de fanzines entre visitantes.",
      spaceNeeds: "Un espacio abierto",
    });
    await expect(actions.createLiveAct(values)).resolves.toEqual({
      success: true,
    });
    const [row] = await stored(values.actName);
    expect(row).toMatchObject({
      category: "other",
      otherType: "Feria de fanzines",
      spaceNeeds: "Un espacio abierto",
      workshopCapacity: null,
      relatedOffer: null,
      noCostAcknowledgedAt: null,
    });
  });

  it("drops fields that do not apply to the category", async () => {
    const values = input({
      category: "music",
      otherType: "Algo",
      workshopCapacity: "30",
      spaceNeeds: "Proyector",
      relatedOffer: "Curso",
      noCostAcknowledged: true,
    });
    await expect(actions.createLiveAct(values)).resolves.toEqual({
      success: true,
    });
    const [row] = await stored(values.actName);
    expect(row).toMatchObject({
      category: "music",
      description: null,
      otherType: null,
      workshopCapacity: null,
      spaceNeeds: null,
      relatedOffer: null,
      noCostAcknowledgedAt: null,
    });
  });

  it("rejects an invalid payload without storing it", async () => {
    const values = input({ category: "workshop", description: "corta" });
    await expect(actions.createLiveAct(values)).resolves.toEqual({
      success: false,
      message: "Revisá los campos marcados antes de enviar.",
    });
    await expect(actions.createLiveAct("nope")).resolves.toMatchObject({
      success: false,
    });
    expect(await stored(values.actName)).toHaveLength(0);
  });

  it("answers a filled honeypot like a postulation and stores nothing", async () => {
    const values = input({ website: "https://spam.example" });
    await expect(actions.createLiveAct(values)).resolves.toEqual({
      success: true,
    });
    expect(await stored(values.actName)).toHaveLength(0);
  });

  it("refuses a flood from one address", async () => {
    const results = [];
    for (let attempt = 0; attempt < 61; attempt++) {
      // Invalid on purpose: the limit counts before parsing, nothing stored.
      results.push(await actions.createLiveAct({ category: "" }));
    }
    expect(results.at(-2)).toMatchObject({
      message: "Revisá los campos marcados antes de enviar.",
    });
    expect(results.at(-1)).toEqual({
      success: false,
      message:
        "Hiciste muchos intentos seguidos. Esperá un rato y volvé a intentar.",
    });
  });
});
