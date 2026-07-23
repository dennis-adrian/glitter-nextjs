import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RegisterInfractionButton from "@/app/components/infractions/register-button";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    refresh: mocks.routerRefresh,
  }),
}));

vi.mock("@/app/components/infractions/global-register-form", () => ({
  default: ({ onSuccess }: { onSuccess: (infractionId: number) => void }) => (
    <button type="button" onClick={() => onSuccess(42)}>
      Complete registration
    </button>
  ),
}));

describe("RegisterInfractionButton", () => {
  beforeEach(() => {
    mocks.routerPush.mockReset();
    mocks.routerRefresh.mockReset();
  });

  afterEach(cleanup);

  it("keeps the user on the infractions list after registration", () => {
    render(<RegisterInfractionButton infractionTypes={[]} festivals={[]} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Registrar infracción" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(mocks.routerPush).not.toHaveBeenCalled();
    expect(mocks.routerRefresh).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Complete registration" }),
    ).toBeNull();
  });
});
