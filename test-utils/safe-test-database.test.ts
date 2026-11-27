// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isSafeTestDatabase,
  resolvePgTarget,
} from "@/test-utils/safe-test-database";

beforeEach(() => {
  // pg's fallbacks read these; pin them so the machine running the tests does
  // not decide the result.
  vi.stubEnv("PGDATABASE", undefined);
  vi.stubEnv("PGUSER", undefined);
  vi.stubEnv("PGHOST", undefined);
  vi.stubEnv("USER", "runner");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isSafeTestDatabase", () => {
  it("accepts a normal URL to a test database", () => {
    const url = "postgres://glitter:glitter@127.0.0.1:55432/glitter_test";
    expect(resolvePgTarget(url)).toEqual({
      host: "127.0.0.1",
      database: "glitter_test",
    });
    expect(isSafeTestDatabase(url)).toBe(true);
    expect(isSafeTestDatabase("postgresql://u@db/app-ci")).toBe(true);
  });

  it("refuses a normal URL to any other database", () => {
    expect(
      isSafeTestDatabase("postgres://u:p@127.0.0.1:5432/glitter_dev"),
    ).toBe(false);
    // The marker has to be a word of its own.
    expect(isSafeTestDatabase("postgres://u@localhost/contest")).toBe(false);
    expect(isSafeTestDatabase("postgres://u@localhost/decision")).toBe(false);
  });

  it("judges a socket: URL by its ?db=, not by the socket directory in its path", () => {
    const url = "socket:/var/run/pg-test?db=prod";
    // The hole this helper closes: the path looks like a test database.
    expect(new URL(url).pathname).toBe("/var/run/pg-test");
    expect(resolvePgTarget(url)).toMatchObject({
      host: "/var/run/pg-test",
      database: "prod",
    });
    expect(isSafeTestDatabase(url)).toBe(false);

    expect(
      isSafeTestDatabase("socket:/var/run/postgresql?db=glitter_test"),
    ).toBe(true);
  });

  it("judges ?host= socket URLs by the database pg selects", () => {
    const safe = "postgres://u@/glitter_test?host=/var/run/postgresql";
    expect(resolvePgTarget(safe)).toEqual({
      host: "/var/run/postgresql",
      database: "glitter_test",
    });
    expect(isSafeTestDatabase(safe)).toBe(true);
    expect(isSafeTestDatabase("postgres://u@/prod?host=/var/run/pg-test")).toBe(
      false,
    );
  });

  it("judges %2F-encoded socket hosts by the database pg selects", () => {
    const safe = "postgres://u@%2Fvar%2Frun%2Fpostgresql/glitter_test";
    expect(resolvePgTarget(safe)).toEqual({
      host: "/var/run/postgresql",
      database: "glitter_test",
    });
    expect(isSafeTestDatabase(safe)).toBe(true);
    expect(isSafeTestDatabase("postgres://u@%2Fvar%2Frun%2Fpg-test/prod")).toBe(
      false,
    );
  });

  describe("with no database in the URL", () => {
    it("falls back to the user, as pg does", () => {
      expect(resolvePgTarget("postgres://prod@localhost")?.database).toBe(
        "prod",
      );
      expect(isSafeTestDatabase("postgres://prod@localhost")).toBe(false);
      expect(isSafeTestDatabase("postgres://glitter_test@localhost")).toBe(
        true,
      );

      vi.stubEnv("USER", "prod");
      expect(isSafeTestDatabase("postgres://localhost")).toBe(false);
      vi.stubEnv("PGUSER", "glitter_test");
      expect(isSafeTestDatabase("postgres://localhost")).toBe(true);
    });

    it("falls back to PGDATABASE before the user", () => {
      vi.stubEnv("PGDATABASE", "prod");
      expect(isSafeTestDatabase("postgres://glitter_test@localhost")).toBe(
        false,
      );
      vi.stubEnv("PGDATABASE", "glitter_ci");
      expect(isSafeTestDatabase("postgres://prod@localhost")).toBe(true);
    });

    it("refuses when pg would select no database at all", () => {
      vi.stubEnv("USER", undefined);
      vi.stubEnv("USERNAME", undefined);
      expect(isSafeTestDatabase("postgres://localhost")).toBe(false);
    });
  });

  it("refuses what pg cannot use", () => {
    expect(
      isSafeTestDatabase(
        "postgres://u@localhost/glitter_test?sslcert=/nonexistent",
      ),
    ).toBe(false);
  });

  describe("localOnly", () => {
    it("accepts the local hosts", () => {
      for (const host of [
        "localhost",
        "127.0.0.1",
        "[::1]",
        "host.docker.internal",
      ]) {
        expect(
          isSafeTestDatabase(`postgres://u@${host}/glitter_test`, {
            localOnly: true,
          }),
        ).toBe(true);
      }
    });

    it("refuses a remote host, including one set through ?host=", () => {
      expect(
        isSafeTestDatabase("postgres://u@db.example.com/glitter_test", {
          localOnly: true,
        }),
      ).toBe(false);
      expect(
        isSafeTestDatabase(
          "postgres://u@localhost/glitter_test?host=db.example.com",
          {
            localOnly: true,
          },
        ),
      ).toBe(false);
    });

    it("refuses a socket, whose host is a directory", () => {
      expect(
        isSafeTestDatabase("socket:/var/run/postgresql?db=glitter_test", {
          localOnly: true,
        }),
      ).toBe(false);
    });

    it("judges a URL with no host by PGHOST", () => {
      vi.stubEnv("PGHOST", "db.example.com");
      expect(
        isSafeTestDatabase("postgres://u@/glitter_test", { localOnly: true }),
      ).toBe(false);
    });
  });

  describe("plainUrl", () => {
    const options = { localOnly: true, plainUrl: true };

    it("accepts a plain local postgres:// URL", () => {
      expect(
        isSafeTestDatabase(
          "postgres://u:p@127.0.0.1:55432/glitter_test",
          options,
        ),
      ).toBe(true);
    });

    it("refuses query strings, fragments, missing hosts and other schemes", () => {
      expect(
        isSafeTestDatabase(
          "postgres://u@localhost/glitter_test?ssl=false",
          options,
        ),
      ).toBe(false);
      expect(
        isSafeTestDatabase("postgres://u@localhost/glitter_test#x", options),
      ).toBe(false);
      expect(isSafeTestDatabase("postgres://u@/glitter_test", options)).toBe(
        false,
      );
      expect(
        isSafeTestDatabase("socket:/var/run/pg?db=glitter_test", options),
      ).toBe(false);
      expect(isSafeTestDatabase("not a url", options)).toBe(false);
    });
  });
});
