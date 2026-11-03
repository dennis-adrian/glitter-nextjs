import { describe, expect, it } from "vitest";

import {
  hasScreenBehind,
  historyOnLoad,
  nextHistory,
} from "@/app/components/navbar/screen-history";

describe("nextHistory", () => {
  it("adds a new screen", () => {
    expect(nextHistory(["/menu"], "/my_orders")).toEqual([
      "/menu",
      "/my_orders",
    ]);
  });

  it("swaps the newest screen on a replace", () => {
    expect(nextHistory(["/menu", "/a"], "/b", { replace: true })).toEqual([
      "/menu",
      "/b",
    ]);
    expect(hasScreenBehind(nextHistory(["/a"], "/b", { replace: true }))).toBe(
      false,
    );
  });

  it("reads a return to the screen before as a step back", () => {
    expect(nextHistory(["/menu", "/my_orders"], "/menu")).toEqual(["/menu"]);
  });

  it("never keeps sign-in as a place to go back to", () => {
    expect(nextHistory(["/my_orders", "/sign_in"], "/my_orders")).toEqual([
      "/my_orders",
    ]);
    expect(nextHistory(["/portal"], "/sign_in/factor-one")).toEqual([
      "/sign_in/factor-one",
    ]);
  });

  it("ignores a change that keeps the same path", () => {
    const history = ["/menu", "/my_orders"];
    expect(nextHistory(history, "/my_orders")).toBe(history);
  });
});

describe("historyOnLoad", () => {
  it("keeps the history on a reload of the newest screen", () => {
    expect(historyOnLoad(["/menu", "/my_orders"], "/my_orders")).toEqual([
      "/menu",
      "/my_orders",
    ]);
  });

  it("starts over on any other document", () => {
    expect(
      historyOnLoad(["/menu", "/my_orders"], "/my_notifications/4"),
    ).toEqual(["/my_notifications/4"]);
  });
});
