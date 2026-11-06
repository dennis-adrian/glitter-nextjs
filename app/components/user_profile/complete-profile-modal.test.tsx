import { act, cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The steps save things; this test is only about whether the dialog opens.
vi.mock("@/app/components/user_profile/creation-process/categories", () => ({
  default: () => null,
}));
vi.mock(
  "@/app/components/user_profile/creation-process/display-name-step",
  () => ({ default: () => <p>Paso del nombre</p> }),
);
vi.mock(
  "@/app/components/user_profile/creation-process/contact-info-step",
  () => ({ default: () => null }),
);
vi.mock(
  "@/app/components/user_profile/creation-process/personal-info-step",
  () => ({ default: () => null }),
);
vi.mock(
  "@/app/components/user_profile/creation-process/user-socials-step",
  () => ({ default: () => null }),
);
vi.mock("@/app/components/user_profile/creation-process/user-pic-step", () => ({
  default: () => null,
}));
vi.mock("@/app/components/notifications/use-push-device", () => ({
  forgetThisBrowserForPush: vi.fn(),
}));

import { setViewState } from "@/app/components/impersonation/view-state";
import CompleteProfileModal from "@/app/components/user_profile/complete-profile-modal";
import type { ProfileType } from "@/app/api/users/definitions";

// Missing its bio, so the dialog would ask for it.
const incomplete = {
  id: 3,
  displayName: "Ana",
  bio: null,
  firstName: "Ana",
  lastName: "Pérez",
  phoneNumber: "70000000",
  imageUrl: "https://example.com/a.png",
  category: "illustration",
  birthdate: new Date(0),
  gender: "female",
  country: "BO",
  state: "La Paz",
  userSocials: [{ type: "instagram", username: "ana" }],
  profileSubcategories: [{ subcategoryId: 1 }],
} as unknown as ProfileType;

const VIEW = {
  secondsLeft: 600,
  subject: {
    id: 3,
    displayName: "Ana",
    firstName: null,
    lastName: null,
    email: "ana@example.com",
    imageUrl: null,
  },
};

async function renderModal() {
  const subcategories = Promise.resolve([]);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <CompleteProfileModal
          profile={incomplete}
          subcategoriesPromise={subcategories}
        />
      </Suspense>,
    );
  });
}

afterEach(() => {
  cleanup();
  act(() => setViewState(null));
});

describe("CompleteProfileModal", () => {
  it("asks a participant with missing fields to complete their profile", async () => {
    await renderModal();
    expect(screen.getByRole("dialog").textContent).toContain(
      "Completá tu perfil",
    );
  });

  it("stays closed while an admin views the app as them", async () => {
    act(() => setViewState(VIEW));
    await renderModal();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes once the view is known, so the banner's Salir is never covered", async () => {
    await renderModal();
    expect(screen.queryByRole("dialog")).not.toBeNull();
    act(() => setViewState(VIEW));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
