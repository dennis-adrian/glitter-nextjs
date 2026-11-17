import { afterEach, describe, expect, it } from "vitest";

import {
  assertDisposableTestDatabase,
  disposableDatabaseProblem,
} from "@/app/lib/testing/disposable-test-database";

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

describe("the module-level guard", () => {
  const env = process.env.GLITTER_DISPOSABLE_TEST_DB_HOSTS;
  afterEach(() => {
    if (env === undefined) delete process.env.GLITTER_DISPOSABLE_TEST_DB_HOSTS;
    else process.env.GLITTER_DISPOSABLE_TEST_DB_HOSTS = env;
  });

  it("lets a suite skip when no URL is set", () => {
    expect(() => assertDisposableTestDatabase(undefined)).not.toThrow();
    expect(() => assertDisposableTestDatabase("")).not.toThrow();
  });

  it("takes the local disposable database", () => {
    expect(() =>
      assertDisposableTestDatabase(
        "postgres://glitter:glitter@127.0.0.1:55432/glitter_test",
      ),
    ).not.toThrow();
  });

  it("refuses a remote *_test database unless its host is approved", () => {
    const url = "postgres://u:p@shuttle.proxy.rlwy.net:5432/glitter_test";
    delete process.env.GLITTER_DISPOSABLE_TEST_DB_HOSTS;
    expect(() => assertDisposableTestDatabase(url)).toThrow(/not this machine/);
    process.env.GLITTER_DISPOSABLE_TEST_DB_HOSTS = "shuttle.proxy.rlwy.net";
    expect(() => assertDisposableTestDatabase(url)).not.toThrow();
  });

  it("names the variable the URL came from", () => {
    expect(() =>
      assertDisposableTestDatabase(
        "postgres://u:p@db.example.com/glitter_test",
        "MERCH_TEST_DATABASE_URL",
      ),
    ).toThrow(/^MERCH_TEST_DATABASE_URL is on "db.example.com"/);
  });
});
