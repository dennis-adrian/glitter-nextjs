import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseProfile } from "@/app/api/users/definitions";
import ActivityCardActions from "@/app/components/participant_dashboard/activity-card/activity-card-actions";
import type {
  ActivityTheme,
  EnrolledConfig,
} from "@/app/components/participant_dashboard/activity-card/types";
import type {
  FestivalActivityWithDetailsAndParticipants,
  WaitlistEntryWithUser,
} from "@/app/lib/festivals/definitions";

const childMocks = vi.hoisted(() => ({
  enrolledUsersCta: vi.fn(),
  pendingActionNotice: vi.fn(),
}));

vi.mock(
  "@/app/components/participant_dashboard/activity-card/enrolled-users-cta",
  () => ({
    default: (props: unknown) => {
      childMocks.enrolledUsersCta(props);
      return <div data-testid="enrolled-users-cta" />;
    },
  }),
);

vi.mock(
  "@/app/components/participant_dashboard/activity-card/pending-action-notice",
  () => ({
    default: (props: unknown) => {
      childMocks.pendingActionNotice(props);
      return <div data-testid="pending-action-notice" />;
    },
  }),
);

type ActionsProps = ComponentProps<typeof ActivityCardActions>;
type Enrollment = ActionsProps["enrollment"];

const forProfile = {
  id: 101,
  category: "illustration",
} as BaseProfile;

const theme: ActivityTheme = {
  bg: "white",
  border: "black",
  accent: "black",
  accentText: "white",
  textPrimary: "navy",
  textSecondary: "purple",
  buttonBg: "green",
  buttonText: "white",
  isPrimary: false,
};

function buildActivity(): FestivalActivityWithDetailsAndParticipants {
  const now = new Date();

  return {
    id: 42,
    name: "Carrera de Sellos",
    description: "Descripción de la actividad",
    registrationStartDate: new Date(now.getTime() - 60 * 60 * 1000),
    registrationEndDate: new Date(now.getTime() + 60 * 60 * 1000),
    promotionalArtUrl: null,
    festivalId: 7,
    visitorsDescription: null,
    type: "stamp_passport",
    activityPrizeUrl: null,
    allowsVoting: false,
    votingStartDate: null,
    votingEndDate: null,
    proofType: "image",
    proofUploadLimitDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    accessLevel: "public",
    waitlistWindowMinutes: null,
    updatedAt: now,
    createdAt: now,
    details: [],
    waitlistEntries: [],
  };
}

function buildUnenrolledEnrollment(
  waitlistEntry: WaitlistEntryWithUser | null = null,
): Enrollment {
  return { isEnrolled: false, waitlistEntry };
}

function buildEnrolledEnrollment(
  overrides: Partial<Extract<Enrollment, { isEnrolled: true }>> = {},
): Enrollment {
  return {
    isEnrolled: true,
    isRemoved: false,
    participationId: 84,
    proofDisplayState: "pending_proof",
    adminFeedback: "Revisá el borde",
    existingPromoHighlight: "2x1",
    existingPromoDescription: "En stickers",
    existingPromoConditions: "Hasta agotar stock",
    ...overrides,
  };
}

function buildWaitlistEntry(
  overrides: Partial<WaitlistEntryWithUser> = {},
): WaitlistEntryWithUser {
  const now = new Date();

  return {
    id: 9,
    activityId: 42,
    userId: forProfile.id,
    position: 3,
    notifiedAt: null,
    expiresAt: null,
    notifiedForDetailId: null,
    updatedAt: now,
    createdAt: now,
    user: forProfile,
    ...overrides,
  };
}

function buildEnrolledConfig(
  overrides: Partial<EnrolledConfig> = {},
): EnrolledConfig {
  return {
    pendingLabel: "Diseño pendiente",
    pendingDescription: "Subí tu diseño",
    ctaLabel: "Subir Diseño",
    ctaType: "upload",
    deadlineDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    isPending: true,
    ...overrides,
  };
}

function renderActions({
  activity = buildActivity(),
  enrollment = buildUnenrolledEnrollment(),
  enrolledConfig = null,
  isInVotingWindow = false,
  enrollmentIsOpen = true,
}: Partial<ActionsProps> = {}) {
  return render(
    <ActivityCardActions
      activity={activity}
      forProfile={forProfile}
      theme={theme}
      enrollment={enrollment}
      enrolledConfig={enrolledConfig}
      activityHref="/profiles/101/festivals/7/activity/42"
      isInVotingWindow={isInVotingWindow}
      enrollmentIsOpen={enrollmentIsOpen}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ActivityCardActions", () => {
  it("shows the removal notice and details link for a removed participant", () => {
    renderActions({
      enrollment: buildEnrolledEnrollment({ isRemoved: true }),
      enrolledConfig: buildEnrolledConfig(),
    });

    expect(
      screen.getByText("No podés volver a inscribirte en esta actividad"),
    ).toBeTruthy();
    const detailsLink = screen.getByRole("link", { name: "Ver detalles" });
    expect(detailsLink.getAttribute("href")).toBe(
      "/profiles/101/festivals/7/activity/42",
    );
    expect(screen.queryByTestId("pending-action-notice")).toBeNull();
    expect(screen.queryByTestId("enrolled-users-cta")).toBeNull();
  });

  it("delegates pending enrolled actions and forwards the participation state", () => {
    const activity = buildActivity();
    const enrollment = buildEnrolledEnrollment();
    const enrolledConfig = buildEnrolledConfig();

    renderActions({ activity, enrollment, enrolledConfig });

    expect(screen.getByTestId("pending-action-notice")).toBeTruthy();
    expect(screen.getByTestId("enrolled-users-cta")).toBeTruthy();
    expect(childMocks.pendingActionNotice).toHaveBeenCalledWith({
      enrolledConfig,
    });
    expect(childMocks.enrolledUsersCta).toHaveBeenCalledWith(
      expect.objectContaining({
        enrolledConfig,
        participationId: 84,
        festivalId: 7,
        activityId: 42,
        forProfile,
        theme,
        proofType: "image",
        proofDisplayState: "pending_proof",
        adminFeedback: "Revisá el borde",
        existingPromoHighlight: "2x1",
        existingPromoDescription: "En stickers",
        existingPromoConditions: "Hasta agotar stock",
      }),
    );
  });

  it("shows the exact voting deadline for an enrolled voting action", () => {
    const deadlineDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const deadlineText = `Hasta: ${deadlineDate.toLocaleString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`;

    renderActions({
      enrollment: buildEnrolledEnrollment({ proofDisplayState: "approved" }),
      enrolledConfig: buildEnrolledConfig({
        ctaType: "link",
        ctaLabel: "Votar Ahora",
        deadlineDate,
        isPending: false,
      }),
    });

    expect(screen.getByText(deadlineText)).toBeTruthy();
    expect(screen.queryByTestId("pending-action-notice")).toBeNull();
    expect(screen.getByTestId("enrolled-users-cta")).toBeTruthy();
  });

  it("renders nothing for an enrolled participant without configuration", () => {
    const { container } = renderActions({
      enrollment: buildEnrolledEnrollment(),
      enrolledConfig: null,
    });

    expect(container.textContent).toBe("");
    expect(childMocks.enrolledUsersCta).not.toHaveBeenCalled();
  });

  it('shows the registration deadline and exact "Participar" CTA when enrollment is open', () => {
    const activity = buildActivity();
    const deadlineText = `Hasta: ${activity.registrationEndDate.toLocaleString(
      "es-ES",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      },
    )}`;

    renderActions({ activity });

    expect(screen.getByText(deadlineText)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Participar" });
    expect(link.getAttribute("href")).toBe(
      "/profiles/101/festivals/7/activity/42",
    );
    expect(screen.queryByText("Ver detalles")).toBeNull();
  });

  it('prioritizes the exact "Votar ahora" CTA during the voting window', () => {
    renderActions({
      isInVotingWindow: true,
      enrollmentIsOpen: false,
    });

    const link = screen.getByRole("link", { name: "Votar ahora" });
    expect(link.getAttribute("href")).toBe(
      "/profiles/101/festivals/7/activity/42/voting",
    );
    expect(screen.queryByText("Participar")).toBeNull();
    expect(screen.queryByText("Ver detalles")).toBeNull();
  });

  it('shows only "Ver detalles" when registration is closed', () => {
    renderActions({ enrollmentIsOpen: false });

    const link = screen.getByRole("link", { name: "Ver detalles" });
    expect(link.getAttribute("href")).toBe(
      "/profiles/101/festivals/7/activity/42",
    );
    expect(screen.queryByText("Participar")).toBeNull();
  });

  it("shows the waitlist position and details link while waiting", () => {
    renderActions({
      enrollment: buildUnenrolledEnrollment(buildWaitlistEntry()),
    });

    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.tagName === "P" &&
          element.textContent ===
            "Estás en la lista de espera en la posición #3",
        ),
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver detalles" })).toBeTruthy();
    expect(screen.queryByText("Participar")).toBeNull();
  });

  it("shows the available-slot message for an active waitlist invitation", () => {
    const now = new Date();
    const waitlistEntry = buildWaitlistEntry({
      notifiedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      notifiedForDetailId: 84,
    });

    renderActions({
      enrollment: buildUnenrolledEnrollment(waitlistEntry),
    });

    expect(screen.getByText("¡Tenés un cupo disponible!")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver detalles" })).toBeTruthy();
    expect(
      screen.queryByText(/Estás en la lista de espera en la posición/),
    ).toBeNull();
  });
});
