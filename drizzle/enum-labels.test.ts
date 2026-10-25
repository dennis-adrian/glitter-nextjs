// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A production release applies every pending migration in one transaction
 * (drizzle's migrator), and Postgres refuses to use an enum label added with
 * `ALTER TYPE … ADD VALUE` before that transaction commits. A preview applies
 * each PR's migration on its own and passes; the release that bundles them
 * would then fail. So no statement may use a label that an earlier statement
 * of the same set adds. Labels of a type created whole with `CREATE TYPE` are
 * fine.
 *
 * The set starts at the first migration not yet in production. Raise
 * `FIRST_UNRELEASED` once a release carries them.
 */
const FIRST_UNRELEASED = 301;

/** `-- enum-labels: existing <type>` on a statement that uses another enum's same-named label. */
const ALLOW = /--\s*enum-labels:\s*existing\s+\S+/;
const ADD_VALUE = /ADD VALUE(?: IF NOT EXISTS)? '([^']+)'/g;

type Migration = { name: string; sql: string };

function statementsOf(sql: string) {
  return sql
    .split(/--> statement-breakpoint|;\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function enumLabelReuse(migrations: Migration[]) {
  const added: { label: string; where: string }[] = [];
  const problems: string[] = [];
  for (const { name, sql } of migrations) {
    statementsOf(sql).forEach((statement, index) => {
      const where = `${name} #${index + 1}`;
      const adds = [...statement.matchAll(ADD_VALUE)].map((m) => m[1]!);
      if (adds.length === 0 && !ALLOW.test(statement)) {
        for (const prior of added) {
          if (statement.includes(`'${prior.label}'`)) {
            problems.push(
              `${where} uses '${prior.label}', which ${prior.where} adds in the same release`,
            );
          }
        }
      }
      for (const label of adds) added.push({ label, where });
    });
  }
  return problems;
}

function unreleasedMigrations(): Migration[] {
  const dir = join(__dirname);
  return readdirSync(dir)
    .filter((file) => /^\d{4}_.*\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) >= FIRST_UNRELEASED)
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

describe("enum labels added in one release", () => {
  it("are never used by a later statement of the same release", () => {
    expect(enumLabelReuse(unreleasedMigrations())).toEqual([]);
  });

  it("catches a label used after it is added, with or without IF NOT EXISTS", () => {
    const problems = enumLabelReuse([
      {
        name: "0901_a.sql",
        sql: `ALTER TYPE "public"."t" ADD VALUE 'x';--> statement-breakpoint
ALTER TYPE "public"."t" ADD VALUE IF NOT EXISTS 'y';`,
      },
      {
        name: "0902_b.sql",
        sql: `CREATE INDEX i ON tbl (c) WHERE kind = 'x';
UPDATE tbl SET kind = 'y' WHERE kind = 'z';`,
      },
    ]);
    expect(problems).toEqual([
      "0902_b.sql #1 uses 'x', which 0901_a.sql #1 adds in the same release",
      "0902_b.sql #2 uses 'y', which 0901_a.sql #2 adds in the same release",
    ]);
  });

  it("lets a statement say it means another enum's label of the same name", () => {
    expect(
      enumLabelReuse([
        {
          name: "0901_a.sql",
          sql: `ALTER TYPE "public"."email_topic" ADD VALUE 'announcements';`,
        },
        {
          name: "0902_b.sql",
          sql: `-- enum-labels: existing notification_category
CREATE INDEX i ON notifications (id) WHERE category = 'announcements';`,
        },
      ]),
    ).toEqual([]);
  });

  it("allows labels of a type the same release creates whole", () => {
    expect(
      enumLabelReuse([
        {
          name: "0901_a.sql",
          sql: `CREATE TYPE "public"."lane" AS ENUM('transactional', 'bulk');--> statement-breakpoint
CREATE INDEX i ON d (id) WHERE lane = 'bulk';`,
        },
      ]),
    ).toEqual([]);
  });
});
