import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NavbarProfile } from "@/app/api/users/definitions";
import SessionButtons from "@/app/components/navbar/session-buttons";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: true }),
}));

// The real bell polls the unread count; standing in for it shows whether it
// was mounted at all.
vi.mock("@/app/components/notifications/notification-bell", () => ({
  default: () => <span data-testid="notification-bell" />,
  NotificationBellPlaceholder: () => (
    <span data-testid="notification-bell-placeholder" />
  ),
}));

vi.mock("@/app/components/ui/user-dropdown", () => ({
  default: () => <span data-testid="user-dropdown" />,
}));

afterEach(cleanup);

const profile = { id: 1, role: "user" } as unknown as NavbarProfile;

function renderButtons(props: {
  profile: NavbarProfile | null;
  isProfileLoading: boolean;
  notificationsEnabled?: boolean;
}) {
  render(
    <SessionButtons
      creditsEnabled={false}
      notificationsEnabled={props.notificationsEnabled ?? true}
      profile={props.profile}
      isProfileLoading={props.isProfileLoading}
    />,
  );
}

describe("the navbar bell", () => {
  it("holds its place without polling while the profile loads", () => {
    renderButtons({ profile: null, isProfileLoading: true });
    expect(screen.getByTestId("notification-bell-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("notification-bell")).toBeNull();
  });

  it("appears once the profile has loaded", () => {
    renderButtons({ profile, isProfileLoading: false });
    expect(screen.getByTestId("notification-bell")).toBeTruthy();
    expect(screen.getByTestId("user-dropdown")).toBeTruthy();
  });

  it("is left out for a session with no profile row", () => {
    renderButtons({ profile: null, isProfileLoading: false });
    expect(screen.queryByTestId("notification-bell")).toBeNull();
    expect(screen.queryByTestId("notification-bell-placeholder")).toBeNull();
    expect(screen.getByTestId("user-dropdown")).toBeTruthy();
  });

  it("is left out while the flag keeps the inbox from this person", () => {
    renderButtons({
      profile,
      isProfileLoading: false,
      notificationsEnabled: false,
    });
    expect(screen.queryByTestId("notification-bell")).toBeNull();
  });
});
