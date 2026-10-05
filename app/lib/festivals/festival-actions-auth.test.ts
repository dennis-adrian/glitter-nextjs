// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => vi.fn());
const dbTouched = vi.hoisted(() => ({ count: 0 }));
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
  sendBatchEmails: sendEmailMock,
}));
vi.mock("@/app/lib/users/helpers", () => {
  const isStaff = (profile: { role: string } | null) =>
    profile?.role === "admin" || profile?.role === "festival_admin";
  return {
    getCurrentUserProfile: profileMock,
    requireAdmin: async () => {
      const profile = await profileMock();
      return profile?.role === "admin" ? profile : null;
    },
    requireAdminOrFestivalAdmin: async () => {
      const profile = await profileMock();
      return isStaff(profile) ? profile : null;
    },
    requireProfileOwnerOrStaff: async (profileId: number) => {
      const profile = await profileMock();
      if (!profile) return null;
      return profile.id === profileId || isStaff(profile) ? profile : null;
    },
  };
});
// Any database access at all fails the test: a refused caller must be turned
// away before the first query.
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        dbTouched.count += 1;
        throw new Error("database touched");
      },
    },
  ),
}));

import * as ticketActions from "@/app/data/tickets/actions";
import * as ticketQueries from "@/app/data/tickets/queries";
import { createBadge } from "@/app/lib/badges/actions";
import * as festivalSectorActions from "@/app/lib/festival_sectors/actions";
import * as festivalActions from "@/app/lib/festivals/actions";
import * as invitationActions from "@/app/lib/festivals/invitations";
import { createTag, deleteTag } from "@/app/lib/tags/actions";
import * as registrationActions from "@/app/lib/visitors/registration-actions";

const {
  fetchAllFestivalEnrolledUsers,
  fetchEnrolledParticipants,
  fetchFestivalActivityForReview,
  fetchFestivalWithDatesAndSectors,
  fetchFestivalWithTicketsAndDates,
  fetchFestivals,
  fetchProfileEnrollmentInFestival,
  getFestivalAvailableUsers,
  setFestivalActive,
  updateFestivalEventDayRegistration,
  updateFestivalRegistration,
} = festivalActions;
const { updateTicket, verifyTicket } = ticketActions;
const { fetchTicketsByFestival, fetchVerifiedTicketsByFestivalTotal } =
  ticketQueries;
const { fetchInvitationAudience, sendParticipantInvitationsToUsers } =
  invitationActions;

// Valid inputs throughout, so an action missing its guard would get past
// validation and reach the database instead of failing for another reason.
const WRITES: [string, () => Promise<unknown>][] = [
  ["updateFestivalRegistration", () => updateFestivalRegistration(1, true)],
  [
    "updateFestivalEventDayRegistration",
    () => updateFestivalEventDayRegistration(1, true),
  ],
  ["setFestivalActive", () => setFestivalActive(1, true)],
  [
    "fetchInvitationAudience",
    () => fetchInvitationAudience(1, "visitor_registration"),
  ],
  [
    "sendParticipantInvitationsToUsers",
    () => sendParticipantInvitationsToUsers(1, [1, 2]),
  ],
  ["updateTicket", () => updateTicket(1, "checked_in")],
  ["verifyTicket", () => verifyTicket(1, 1)],
  [
    "createTag",
    () => createTag({ label: "Acuarela", category: "illustration" }),
  ],
  ["deleteTag", () => deleteTag(1)],
  [
    "createBadge",
    () =>
      createBadge({
        name: "Medalla",
        imageUrl: "https://example.com/medalla.png",
        festivalId: 1,
      }),
  ],
];

const READS: [string, () => Promise<unknown>, unknown][] = [
  ["getFestivalAvailableUsers", () => getFestivalAvailableUsers(1), []],
  ["fetchAllFestivalEnrolledUsers", () => fetchAllFestivalEnrolledUsers(1), []],
  ["fetchEnrolledParticipants", () => fetchEnrolledParticipants(1), []],
  [
    "fetchFestivalActivityForReview",
    () => fetchFestivalActivityForReview(1, 1),
    undefined,
  ],
  [
    "fetchFestivalWithTicketsAndDates",
    () => fetchFestivalWithTicketsAndDates(1),
    null,
  ],
  [
    "fetchFestivalWithDatesAndSectors",
    () => fetchFestivalWithDatesAndSectors(1),
    null,
  ],
  ["fetchFestivals", () => fetchFestivals(), []],
  ["fetchTicketsByFestival", () => fetchTicketsByFestival(1), []],
  [
    "fetchVerifiedTicketsByFestivalTotal",
    () => fetchVerifiedTicketsByFestivalTotal(1),
    0,
  ],
];

describe.each([
  ["a signed-out visitor", null],
  ["a participant", { id: 5, role: "user" }],
])("staff festival actions called by %s", (_, profile) => {
  beforeEach(() => {
    profileMock.mockReset();
    profileMock.mockResolvedValue(profile);
    dbTouched.count = 0;
    sendEmailMock.mockReset();
  });

  it.each(WRITES)("%s is refused before any query", async (_name, call) => {
    const result = await call();

    expect(result).toMatchObject({ success: false });
    expect(dbTouched.count).toBe(0);
  });

  it.each(READS)(
    "%s returns nothing before any query",
    async (_name, call, empty) => {
      expect(await call()).toEqual(empty);
      expect(dbTouched.count).toBe(0);
      expect(sendEmailMock).not.toHaveBeenCalled();
    },
  );
});

describe("fetchProfileEnrollmentInFestival", () => {
  beforeEach(() => {
    profileMock.mockReset();
    dbTouched.count = 0;
  });

  it.each([
    ["a signed-out visitor", null],
    ["another participant", { id: 5, role: "user" }],
  ])("refuses %s before any query", async (_, profile) => {
    profileMock.mockResolvedValue(profile);

    expect(await fetchProfileEnrollmentInFestival(6, 1)).toBeUndefined();
    expect(dbTouched.count).toBe(0);
  });

  it("lets the profile itself through to the query", async () => {
    profileMock.mockResolvedValue({ id: 6, role: "user" });

    await expect(fetchProfileEnrollmentInFestival(6, 1)).rejects.toThrow(
      "database touched",
    );
    expect(dbTouched.count).toBeGreaterThan(0);
  });
});

describe("public visitor actions", () => {
  beforeEach(() => {
    profileMock.mockReset();
    profileMock.mockResolvedValue(null);
    dbTouched.count = 0;
  });

  it("looks nobody up for a value that is not an email", async () => {
    const result = await registrationActions.startVisitorRegistration({
      festivalId: 1,
      email: "1 OR 1=1",
      mode: "online",
    });

    expect(result).toMatchObject({ success: false });
    expect(dbTouched.count).toBe(0);
  });

  it("refuses a ticket for a value that is not a date", async () => {
    const result = await registrationActions.claimTicket({
      festivalId: 1,
      date: "nope",
    });

    expect(result).toMatchObject({ success: false });
    expect(dbTouched.count).toBe(0);
  });

  it("refuses a door ticket for more people than one admits", async () => {
    const result = await registrationActions.claimDoorTicket({
      festivalId: 1,
      numberOfVisitors: 11,
    });

    expect(result).toMatchObject({ success: false });
    expect(dbTouched.count).toBe(0);
  });
});

describe("server-only reads are not server actions", () => {
  // Every export of a "use server" module is a public endpoint, so these must
  // live in the server-only query modules instead.
  it.each([
    [festivalActions, "fetchFestival"],
    [festivalActions, "fetchFestivalActivitiesByFestivalId"],
    [festivalActions, "fetchFestivalParticipants"],
    [festivalActions, "queueEmails"],
    [festivalActions, "sendEmailToUsers"],
    [festivalActions, "sendEmailToVisitors"],
    [festivalSectorActions, "fetchFestivalSectors"],
    [festivalSectorActions, "fetchFestivalSectorsByUserCategory"],
    [festivalSectorActions, "fetchFullFestivalById"],
    [festivalSectorActions, "fetchConfirmedProfilesByFestivalId"],
    [festivalSectorActions, "fetchSectorWithStandsAndReservations"],
    [ticketActions, "fetchTicket"],
    [ticketActions, "fetchTicketsByFestival"],
    [ticketActions, "fetchVerifiedTicketsByFestivalTotal"],
    [registrationActions, "issueTicket"],
    [registrationActions, "sendTicketIssuedEmail"],
    [registrationActions, "visitorRegistrationView"],
  ] as [Record<string, unknown>, string][])("%#: %s", (module, name) => {
    expect(module).not.toHaveProperty(name);
  });
});
