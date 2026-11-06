import { describe, expect, it } from "vitest";

import { started } from "@/app/lib/started";

describe("started", () => {
  it("resolves to the query's value", async () => {
    await expect(started(Promise.resolve(3))).resolves.toBe(3);
  });

  it("still throws the query's error when awaited", async () => {
    await expect(started(Promise.reject(new Error("db down")))).rejects.toThrow(
      "db down",
    );
  });

  it("never reports an unhandled rejection when nobody awaits it", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);

    started(Promise.reject(new Error("never awaited")));
    await new Promise((resolve) => setTimeout(resolve, 20));

    process.off("unhandledRejection", listener);
    expect(unhandled).toEqual([]);
  });
});
