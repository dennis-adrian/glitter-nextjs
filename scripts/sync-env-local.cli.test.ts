import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  launchExecAfterSync,
  syncEnvStatusExitCode,
} from "@/scripts/sync-env-local";

describe("sync-env-local --exec fail-closed", () => {
  it("exits 1 for Cloud Agent when Clerk is missing (same as bare env:sync)", () => {
    expect(
      syncEnvStatusExitCode({ cloudAgent: true, clerk: "missing" }),
    ).toBe(1);
    expect(syncEnvStatusExitCode({ cloudAgent: true, clerk: "ok" })).toBe(0);
    expect(
      syncEnvStatusExitCode({ cloudAgent: false, clerk: "missing" }),
    ).toBe(0);
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
    const spawn = vi.fn(() => child);
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
