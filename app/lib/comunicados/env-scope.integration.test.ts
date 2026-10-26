// @vitest-environment node

import { randomUUID } from "crypto";
import { and, asc, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { VercelEnvironment } from "@/app/lib/comunicados/contracts";
import * as schema from "@/db/schema";
import { notifications } from "@/db/schema";

/**
 * Which campaigns a lane-wide run may take (docs/IMPLEMENTATION-comunicados.md
 * D9): only those a comunicado sent from this process's environment, read
 * from `audience_summary.env`. Every row is written inside one transaction
 * that is rolled back at the end, so the file leaves nothing behind.
 */

vi.mock("server-only", () => ({}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    return /(^|[_-])(test|ci)([_-]|$)/i.test(
      decodeURIComponent(new URL(url).pathname.slice(1)),
    );
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 2 })
  : null;
const describeDatabase = pool ? describe : describe.skip;

type EnvScope = typeof import("@/app/lib/comunicados/env-scope");
let envScope: EnvScope;
let client: PoolClient;
let tx: NodePgDatabase<typeof schema>;

const ENVIRONMENTS: VercelEnvironment[] = [
  "development",
  "preview",
  "production",
];

/** Campaign ids by what sent them. */
const campaigns = {} as Record<
  VercelEnvironment | "noEnvironment" | "gift",
  number
>;
const notificationIds: number[] = [];

async function insertCampaign(type: "comunicado" | "credit_gift") {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO notification_campaigns (type, status, title, message, idempotency_key)
     VALUES ($1, 'processing', 'Alcance', 'Texto', $2)
     RETURNING id`,
    [type, `${type}:test-${randomUUID()}`],
  );
  return rows[0]!.id;
}

/** A sent comunicado; only the summary's `env` is read here. */
async function insertSent(campaignId: number, summary: object | null) {
  await client.query(
    `INSERT INTO comunicados (status, title, campaign_id, current_revision, sent_at, audience_summary)
     VALUES ('sent', 'Alcance', $1, 1, now(), $2::jsonb)`,
    [campaignId, summary === null ? null : JSON.stringify(summary)],
  );
}

async function campaignsIn(env: VercelEnvironment) {
  const { rows } = await tx.execute<{ id: number }>(
    sql`SELECT c.id FROM notification_campaigns c
        WHERE c.id = ANY(${sql.param(Object.values(campaigns))}::int[])
          AND ${envScope.comunicadoCampaignsInEnvSql(sql`c.id`, env)}
        ORDER BY c.id`,
  );
  return rows.map((row) => row.id);
}

describeDatabase("comunicado environment scope", () => {
  beforeAll(async () => {
    envScope = await import("@/app/lib/comunicados/env-scope");
    client = await pool!.connect();
    tx = drizzle(client, { schema });
    await client.query("BEGIN");
    const probe = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'comunicados' AND column_name = 'audience_summary'`,
    );
    if (probe.rows.length === 0) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    for (const env of ENVIRONMENTS) {
      campaigns[env] = await insertCampaign("comunicado");
      await insertSent(campaigns[env], { v: 1, env });
    }
    // Sent before summaries carried an environment.
    campaigns.noEnvironment = await insertCampaign("comunicado");
    await insertSent(campaigns.noEnvironment, null);
    campaigns.gift = await insertCampaign("credit_gift");

    const suffix = randomUUID();
    const user = await client.query<{ id: number }>(
      `INSERT INTO users (clerk_id, email, display_name, role, status)
       VALUES ($1, $1 || '@example.test', 'Alcance', 'user', 'verified')
       RETURNING id`,
      [`env-scope-${suffix}`],
    );
    // One inbox item per campaign, and one that belongs to none.
    for (const campaignId of [...Object.values(campaigns), null]) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO notifications (user_id, kind, category, title, body, campaign_id, dedupe_key)
         VALUES ($1, 'comunicado', 'announcements', 'Alcance', 'Texto', $2, $3)
         RETURNING id`,
        [user.rows[0]!.id, campaignId, `env-scope:${randomUUID()}`],
      );
      notificationIds.push(rows[0]!.id);
    }
  }, 60_000);

  afterAll(async () => {
    await client?.query("ROLLBACK");
    client?.release();
    await pool?.end();
  });

  it.each(ENVIRONMENTS)(
    "takes only the campaigns sent from %s",
    async (env) => {
      expect(await campaignsIn(env)).toEqual([campaigns[env]]);
    },
  );

  it("scopes the lane where the inbox item is joined as notifications", async () => {
    const rows = await tx
      .select({ campaignId: notifications.campaignId })
      .from(notifications)
      .where(
        and(
          inArray(notifications.id, notificationIds),
          envScope.comunicadoNotificationScope("preview"),
        ),
      )
      .orderBy(asc(notifications.id));

    // Not production's or development's, not a gift's, not one without a
    // campaign or without an environment.
    expect(rows).toEqual([{ campaignId: campaigns.preview }]);
  });
});
