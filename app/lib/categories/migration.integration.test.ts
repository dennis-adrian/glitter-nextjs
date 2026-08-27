import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (testDatabaseUrl) {
  const databaseName = decodeURIComponent(
    new URL(testDatabaseUrl).pathname.slice(1),
  );
  if (!/(^|[_-])(test|ci)([_-]|$)/i.test(databaseName)) {
    throw new Error(
      "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
    );
  }
}

const migration = readFileSync(
  join(process.cwd(), "drizzle/0236_manageable_categories.sql"),
  "utf8",
);
const descriptionBackfill = migration
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .find(
    (statement) =>
      statement.startsWith('UPDATE "subcategories"') &&
      statement.includes('"description_json"') &&
      statement.includes('"description_html"'),
  );

if (!descriptionBackfill) {
  throw new Error("Category description backfill was not found");
}

const client = testDatabaseUrl
  ? new Client({ connectionString: testDatabaseUrl })
  : null;
const describeDatabase = client ? describe : describe.skip;

describeDatabase("manageable categories migration", () => {
  beforeAll(async () => {
    await client!.connect();
  });

  afterAll(async () => {
    await client!.end();
  });

  it("preserves a legacy description in JSON and HTML", async () => {
    const description = "Legacy <b>description</b> & details";

    await client!.query("BEGIN");
    try {
      await client!.query(`
        CREATE TEMP TABLE "subcategories" (
          "id" serial PRIMARY KEY,
          "description" text,
          "description_json" jsonb,
          "description_html" text
        ) ON COMMIT DROP
      `);
      const fixture = await client!.query<{ id: number }>(
        `INSERT INTO "subcategories" ("description") VALUES ($1) RETURNING "id"`,
        [description],
      );

      await client!.query(descriptionBackfill);

      const result = await client!.query<{
        description_json: unknown;
        description_html: string;
      }>(`SELECT "description_json", "description_html" FROM "subcategories"`);

      expect(result.rows[0]).toEqual({
        description_json: [
          {
            id: `legacy-${fixture.rows[0].id}`,
            type: "paragraph",
            props: {
              textColor: "default",
              backgroundColor: "default",
              textAlignment: "left",
            },
            content: [{ type: "text", text: description, styles: {} }],
            children: [],
          },
        ],
        description_html:
          "<p>Legacy &lt;b&gt;description&lt;/b&gt; &amp; details</p>",
      });
    } finally {
      await client!.query("ROLLBACK");
    }
  });
});
