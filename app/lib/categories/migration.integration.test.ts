import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CANONICAL_LABEL_ENVIRONMENT_SQL,
  CANONICAL_LABEL_SQL,
} from "@/app/lib/categories/label";

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
const statements = migration
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim());
const descriptionBackfill = statements.find(
  (statement) =>
    statement.startsWith('UPDATE "subcategories"') &&
    statement.includes('"description_json"') &&
    statement.includes('"description_html"'),
);
const uniqueIndexEnvironmentPreflight = statements.find((statement) =>
  statement.includes("Canonical label environment preflight"),
);
const uniqueIndexPreflight = statements.find((statement) =>
  statement.includes("Canonical label duplicate preflight"),
);
const uniqueIndexCreate = statements.find((statement) =>
  statement.includes("CREATE UNIQUE INDEX \"subcategories_category_lower_label_unique\""),
);
const additiveMigration = readFileSync(
  join(process.cwd(), "drizzle/0242_category_image_file_key.sql"),
  "utf8",
);
const additiveStatements = additiveMigration
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim());
const additiveEnvironmentPreflight = additiveStatements.find((statement) =>
  statement.includes("Canonical label environment preflight"),
);
const additivePreflight = additiveStatements.find((statement) =>
  statement.includes("Canonical label duplicate preflight"),
);

if (!descriptionBackfill) {
  throw new Error("Category description backfill was not found");
}
if (!uniqueIndexEnvironmentPreflight) {
  throw new Error("Canonical label environment preflight was not found");
}
if (!uniqueIndexPreflight) {
  throw new Error("Canonical label duplicate preflight was not found");
}
if (!uniqueIndexCreate) {
  throw new Error("Unique label index creation was not found");
}
if (!additiveEnvironmentPreflight) {
  throw new Error(
    "Additive category image migration environment preflight was not found",
  );
}
if (!additivePreflight) {
  throw new Error("Additive category image migration preflight was not found");
}

describe("manageable categories migration SQL", () => {
  it("runs canonical duplicate preflight before creating the unique index", () => {
    expect(migration.indexOf("Canonical label environment preflight")).toBeLessThan(
      migration.indexOf("Canonical label duplicate preflight"),
    );
    expect(migration.indexOf("Canonical label duplicate preflight")).toBeLessThan(
      migration.indexOf(
        'CREATE UNIQUE INDEX "subcategories_category_lower_label_unique"',
      ),
    );
    expect(uniqueIndexEnvironmentPreflight).toContain(
      CANONICAL_LABEL_ENVIRONMENT_SQL,
    );
    expect(uniqueIndexEnvironmentPreflight).not.toContain(CANONICAL_LABEL_SQL);
    expect(uniqueIndexPreflight).toContain(CANONICAL_LABEL_SQL);
    expect(uniqueIndexPreflight).toMatch(/RAISE EXCEPTION/i);
  });

  it("escapes legacy description text before storing HTML", () => {
    expect(descriptionBackfill).toContain("&amp;");
    expect(descriptionBackfill).toContain("&lt;");
    expect(descriptionBackfill).toContain("&gt;");
    expect(migration.indexOf(descriptionBackfill)).toBeLessThan(
      migration.indexOf('DROP COLUMN "description"'),
    );
  });

  it("warns on canonical duplicates in the additive image_file_key migration", () => {
    expect(additiveMigration.indexOf("Canonical label environment preflight")).toBeLessThan(
      additiveMigration.indexOf("Canonical label duplicate preflight"),
    );
    expect(additiveEnvironmentPreflight).toContain(
      CANONICAL_LABEL_ENVIRONMENT_SQL,
    );
    expect(additiveEnvironmentPreflight).not.toContain(CANONICAL_LABEL_SQL);
    expect(additivePreflight).toContain(CANONICAL_LABEL_SQL);
    expect(additivePreflight).toMatch(/RAISE WARNING/i);
    expect(additivePreflight).not.toMatch(/RAISE EXCEPTION/i);
    expect(additiveMigration).toContain(
      'ALTER TABLE "subcategories" ADD COLUMN "image_file_key" text',
    );
  });
});

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

  it("rejects unsupported environments before duplicate detection", async () => {
    await client!.query("BEGIN");
    try {
      await client!.query(`
        CREATE TEMP TABLE "subcategories" (
          "id" serial PRIMARY KEY,
          "name" text NOT NULL,
          "category" text NOT NULL
        ) ON COMMIT DROP
      `);
      await client!.query(
        `INSERT INTO "subcategories" ("name", "category") VALUES
          ('Café', 'illustration'),
          ('Cafe', 'illustration')`,
      );
      await client!.query("SET LOCAL standard_conforming_strings = off");

      await expect(
        client!.query(uniqueIndexEnvironmentPreflight),
      ).rejects.toThrow(/standard_conforming_strings/i);
    } finally {
      await client!.query("ROLLBACK");
    }
  });

  it("aborts unique-index preflight when canonical labels collide", async () => {
    await client!.query("BEGIN");
    try {
      await client!.query(`
        CREATE TEMP TABLE "subcategories" (
          "id" serial PRIMARY KEY,
          "name" text NOT NULL,
          "category" text NOT NULL
        ) ON COMMIT DROP
      `);
      await client!.query(
        `INSERT INTO "subcategories" ("name", "category") VALUES
          ('Café', 'illustration'),
          ('Cafe', 'illustration')`,
      );

      await expect(client!.query(uniqueIndexPreflight)).rejects.toThrow(
        /Duplicate category labels under backfill canonicalization/i,
      );
    } finally {
      await client!.query("ROLLBACK");
    }
  });

  it("does not abort the additive image_file_key preflight when canonical labels collide", async () => {
    await client!.query("BEGIN");
    try {
      await client!.query(`
        CREATE TEMP TABLE "subcategories" (
          "id" serial PRIMARY KEY,
          "name" text NOT NULL,
          "category" text NOT NULL
        ) ON COMMIT DROP
      `);
      await client!.query(
        `INSERT INTO "subcategories" ("name", "category") VALUES
          ('Café', 'illustration'),
          ('Cafe', 'illustration')`,
      );

      await expect(client!.query(additivePreflight)).resolves.toBeDefined();
    } finally {
      await client!.query("ROLLBACK");
    }
  });

  it("treats a combining mark outside U+0300–U+036F as a canonical duplicate", async () => {
    const cafeWithExtendedMark = "Cafe\u{1AB0}";

    await client!.query("BEGIN");
    try {
      await client!.query(`
        CREATE TEMP TABLE "subcategories" (
          "id" serial PRIMARY KEY,
          "name" text NOT NULL,
          "category" text NOT NULL
        ) ON COMMIT DROP
      `);
      await client!.query(
        `INSERT INTO "subcategories" ("name", "category") VALUES
          ('Cafe', 'illustration'),
          ($1, 'illustration')`,
        [cafeWithExtendedMark],
      );

      await expect(client!.query(uniqueIndexPreflight)).rejects.toThrow(
        /Duplicate category labels under backfill canonicalization/i,
      );
    } finally {
      await client!.query("ROLLBACK");
    }

    await client!.query("BEGIN");
    try {
      await client!.query(`
        CREATE TEMP TABLE "subcategories" (
          "id" serial PRIMARY KEY,
          "name" text NOT NULL,
          "category" text NOT NULL
        ) ON COMMIT DROP
      `);
      await client!.query(
        `CREATE UNIQUE INDEX "subcategories_canonical_label_unique" ON "subcategories" ("category", (${CANONICAL_LABEL_SQL}))`,
      );
      await client!.query(
        `INSERT INTO "subcategories" ("name", "category") VALUES ('Cafe', 'illustration')`,
      );
      await expect(
        client!.query(
          `INSERT INTO "subcategories" ("name", "category") VALUES ($1, 'illustration')`,
          [cafeWithExtendedMark],
        ),
      ).rejects.toThrow(/duplicate key/i);
    } finally {
      await client!.query("ROLLBACK");
    }
  });
});
