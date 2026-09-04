import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import {
  EXEC_USAGE,
  launchExecAfterSync,
  parseExecArgs,
  syncEnvStatusExitCode,
} from "@/scripts/sync-env-local";

describe("parseExecArgs", () => {
  it("returns empty exec when --exec is absent (sync-only)", () => {
    expect(parseExecArgs([])).toEqual({ exec: [] });
    expect(parseExecArgs(["--verbose"])).toEqual({ exec: [] });
  });

  it("returns a usage error when --exec is present with no command", () => {
    const parsed = parseExecArgs(["--exec"]);
    expect(parsed.exec).toEqual([]);
    expect(parsed.error).toContain("Missing command after --exec");
    expect(parsed.error).toContain(EXEC_USAGE);
  });

  it("parses the command and args after --exec", () => {
    expect(parseExecArgs(["--exec", "tsx", "scripts/migrate.ts"])).toEqual({
      exec: ["tsx", "scripts/migrate.ts"],
    });
  });
});

describe("sync-env-local --exec fail-closed", () => {
  it("exits 1 for Cloud Agent when Clerk is missing (same as bare env:sync)", () => {
    expect(syncEnvStatusExitCode({ cloudAgent: true, clerk: "missing" })).toBe(
      1,
    );
    expect(syncEnvStatusExitCode({ cloudAgent: true, clerk: "ok" })).toBe(0);
    expect(syncEnvStatusExitCode({ cloudAgent: false, clerk: "missing" })).toBe(
      0,
    );
  });

  it("does not spawn when Cloud Agent Clerk is missing", () => {
    const spawn = vi.fn();
    const exit = vi.fn();

    launchExecAfterSync(
      {
        wrote: false,
        cloudAgent: true,
        clerk: "missing",
        path: "/tmp/.env.local",
        keyCount: 0,
      },
      ["next", "dev"],
      { spawn, exit },
    );

    expect(spawn).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("spawns --exec when Clerk is ok", () => {
    const child = new EventEmitter() as EventEmitter & {
      on: EventEmitter["on"];
    };
    // Typed through the generic rather than by declaring parameters the double
    // ignores, so the recorded call is still a tuple the assertions can index.
    const spawn = vi.fn<
      (
        command: string,
        args: readonly string[],
        options: SpawnOptions,
      ) => ChildProcess
    >(() => child as unknown as ChildProcess);
    const exit = vi.fn();

    launchExecAfterSync(
      {
        wrote: true,
        cloudAgent: true,
        clerk: "ok",
        path: "/tmp/sync-env-cli-test-missing.env",
        keyCount: 2,
      },
      ["echo", "hi"],
      {
        spawn,
        exit,
        existsSync: () => false,
      },
    );

    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn.mock.calls[0]?.[0]).toBe("echo");
    expect(spawn.mock.calls[0]?.[1]).toEqual(["hi"]);
    expect(exit).not.toHaveBeenCalled();
  });
});
