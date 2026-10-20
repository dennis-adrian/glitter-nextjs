import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/festivals/invitations", () => ({
  sendInvitationBatch: vi.fn(),
}));

import { retryOf } from "@/app/components/festivals/invitations/use-invitation-sender";
import type { InvitationPageFailure } from "@/app/lib/festivals/invitation-definitions";

const page: InvitationPageFailure = {
  cursor: 100,
  throughId: 200,
  count: 80,
  message: "x",
  refused: false,
  attempt: 0,
};

describe("retryOf", () => {
  it("moves to a new key only when Resend refused a page nothing else may have sent", () => {
    expect(retryOf({ ...page, refused: true })).toMatchObject({
      cursor: 100,
      throughId: 200,
      attempt: 1,
      follow: false,
      uncertain: false,
    });
  });

  it("keeps the key after an unknown outcome, and stays uncertain", () => {
    expect(retryOf(page)).toMatchObject({ attempt: 0, uncertain: true });
  });

  it("keeps the key after a refusal once an earlier attempt may have gone out", () => {
    // A timeout first, then a 429 on the retry: the 429 says nothing about
    // the first attempt, so a new key could deliver the page twice.
    expect(
      retryOf({ ...page, refused: true, uncertain: true, attempt: 0 }),
    ).toMatchObject({ attempt: 0, uncertain: true });
  });

  it("resumes a call that never completed from its cursor, to the end", () => {
    expect(
      retryOf({
        ...page,
        throughId: null,
        count: 0,
        follow: true,
        uncertain: true,
      }),
    ).toMatchObject({ cursor: 100, throughId: null, attempt: 0, follow: true });
  });
});
