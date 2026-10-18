import { describe, expect, it } from "vitest";

import { loggableError } from "@/app/lib/errors/loggable-error";

describe("loggableError", () => {
  it("keeps the code and constraint of a query error but not its parameters", () => {
    const cause = Object.assign(new Error("duplicate key value"), {
      code: "23505",
      constraint: "visitors_email_unique",
      table: "visitors",
    });
    const error = new Error(
      "Failed query: insert into visitors ... params: ana@mail.com,Ana,+59171234567",
      { cause },
    );
    error.name = "DrizzleQueryError";

    const logged = loggableError(error);

    expect(logged).toEqual({
      name: "DrizzleQueryError",
      code: "23505",
      constraint: "visitors_email_unique",
      table: "visitors",
    });
    expect(JSON.stringify(logged)).not.toContain("ana@mail.com");
  });

  it("names what was thrown when it is not an Error", () => {
    expect(loggableError("boom")).toEqual({ name: "string" });
    expect(loggableError(undefined)).toEqual({ name: "undefined" });
  });
});
