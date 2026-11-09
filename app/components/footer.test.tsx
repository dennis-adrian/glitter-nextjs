import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Footer from "@/app/components/footer";

const { pathnameMock, userMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(),
  userMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));
vi.mock("@clerk/nextjs", () => ({ useUser: userMock }));
vi.mock("@/app/components/landing/glitter-logo", () => ({
  default: () => null,
}));

afterEach(cleanup);

beforeEach(() => {
  pathnameMock.mockReturnValue("/festivals");
  userMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
});

function footer() {
  return screen.queryByRole("contentinfo");
}

describe("the site footer", () => {
  it("shows on public pages for visitors", () => {
    render(<Footer />);
    expect(footer()).not.toBeNull();
    expect(screen.getByText("info@productoraglitter.com")).toBeTruthy();
  });

  it("is gone for anyone signed in, whatever the page", () => {
    userMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    for (const path of ["/festivals", "/merch", "/my_profile", "/menu"]) {
      pathnameMock.mockReturnValue(path);
      const { unmount } = render(<Footer />);
      expect(footer()).toBeNull();
      unmount();
    }
  });

  it("follows the server's answer until Clerk loads", () => {
    userMock.mockReturnValue({ isLoaded: false, isSignedIn: undefined });

    const { unmount } = render(<Footer signedIn />);
    expect(footer()).toBeNull();
    unmount();

    render(<Footer signedIn={false} />);
    expect(footer()).not.toBeNull();
  });

  it("lets Clerk overrule a stale server answer, as after signing out", () => {
    render(<Footer signedIn />);
    expect(footer()).not.toBeNull();
  });

  it("keeps out of the landing, the dashboard and festival registration", () => {
    for (const path of [
      "/",
      "/dashboard/users",
      "/festivals/3/registration",
    ]) {
      pathnameMock.mockReturnValue(path);
      const { unmount } = render(<Footer />);
      expect(footer()).toBeNull();
      unmount();
    }
  });
});
