import { describe, expect, it } from "vitest";

import { disposableDatabaseProblem } from "@/app/lib/links/disposable-test-database";

describe("which database a test may empty", () => {
  it.each([
    "postgres://glitter:glitter@127.0.0.1:55432/glitter_test",
    "postgres://glitter:glitter@localhost:5432/glitter_test",
    "postgresql://glitter:glitter@[::1]:5432/glitter-ci",
    "postgres://glitter:glitter@LOCALHOST/test_glitter",
  ])("takes the disposable one on this machine: %s", (url) => {
    expect(disposableDatabaseProblem(url, undefined)).toBeNull();
  });

  it.each([
    [
      "a deployment's, whatever it is called",
      "postgres://u:p@shuttle.proxy.rlwy.net:5432/glitter_test",
    ],
    [
      "a host that only looks local",
      "postgres://u:p@localhost.evil.example.com/glitter_test",
    ],
    [
      "a host that only looks local",
      "postgres://u:p@127.0.0.1.nip.io/glitter_test",
    ],
    [
      "another machine on the network",
      "postgres://u:p@10.0.0.5:5432/glitter_test",
    ],
  ])("refuses %s", (_what, url) => {
    expect(disposableDatabaseProblem(url, undefined)).toMatch(
      /not this machine/,
    );
  });

  it.each([
    "postgres://glitter:glitter@127.0.0.1:5432/glitter_dev",
    "postgres://glitter:glitter@127.0.0.1:5432/railway",
    "postgres://glitter:glitter@127.0.0.1:5432/contest",
    "postgres://glitter:glitter@127.0.0.1:5432/",
  ])("refuses a local database not named for testing: %s", (url) => {
    expect(disposableDatabaseProblem(url, undefined)).toMatch(/'test' or 'ci'/);
  });

  it("takes another host only when it was approved by name", () => {
    const url = "postgres://glitter:glitter@postgres:5432/glitter_test";
    expect(disposableDatabaseProblem(url, undefined)).not.toBeNull();
    expect(disposableDatabaseProblem(url, "")).not.toBeNull();
    expect(disposableDatabaseProblem(url, "other-host")).not.toBeNull();
    expect(disposableDatabaseProblem(url, "other-host, Postgres ")).toBeNull();
    // Approval is for the host; the name still has to be one for testing.
    expect(
      disposableDatabaseProblem(
        "postgres://u:p@postgres:5432/glitter",
        "postgres",
      ),
    ).toMatch(/'test' or 'ci'/);
  });

  it.each([
    ["a host", "?host=db.example.com"],
    ["a host, after other parameters", "?sslmode=require&host=db.example.com"],
    ["a Unix socket", "?host=/var/run/postgresql"],
    ["a host address", "?hostaddr=10.9.8.7"],
    ["a host, in capitals", "?HOST=db.example.com"],
    ["an approved host, even", "?host=postgres"],
  ])("refuses a local address whose query string names %s", (_what, query) => {
    const problem = disposableDatabaseProblem(
      `postgres://glitter:glitter@127.0.0.1:55432/glitter_test${query}`,
      "postgres",
    );
    expect(problem).toMatch(/in its query string/);
  });

  it("still takes a local address with parameters that do not move it", () => {
    expect(
      disposableDatabaseProblem(
        "postgres://glitter:glitter@127.0.0.1:55432/glitter_test?sslmode=disable&application_name=tests",
        undefined,
      ),
    ).toBeNull();
  });

  it("is checked against where pg would really connect", async () => {
    // The reason for the rule above, held to the installed driver: if `pg`
    // stops reading `host` from the query string, this says so.
    const { Client } = await import("pg");
    const moved = new Client({
      connectionString:
        "postgres://glitter:glitter@127.0.0.1:55432/glitter_test?host=db.example.com",
    });
    expect(moved.host).toBe("db.example.com");

    const plain = new Client({
      connectionString:
        "postgres://glitter:glitter@127.0.0.1:55432/glitter_test?sslmode=disable",
    });
    expect(plain.host).toBe("127.0.0.1");
    // The database is the one in the address whatever the query string says.
    const renamed = new Client({
      connectionString:
        "postgres://glitter:glitter@127.0.0.1:55432/glitter_test?database=production&dbname=production",
    });
    expect(renamed.database).toBe("glitter_test");
  });

  it("refuses what is not a Postgres URL at all", () => {
    expect(disposableDatabaseProblem("glitter_test", undefined)).toMatch(
      /not a URL/,
    );
    expect(
      disposableDatabaseProblem("https://127.0.0.1/glitter_test", undefined),
    ).toMatch(/not a Postgres URL/);
  });

  it("never repeats the password in what it says", () => {
    const problem = disposableDatabaseProblem(
      "postgres://admin:s3cr3t-pass@db.example.com:5432/glitter_test",
      undefined,
    );
    expect(problem).toContain("db.example.com");
    expect(problem).not.toContain("s3cr3t-pass");
    expect(problem).not.toContain("admin");
  });
});
