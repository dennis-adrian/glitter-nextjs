import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ move: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/lib/festival_activites/admin-actions", () => ({
  moveActivityParticipant: mocks.move,
  retryWaitlistInvitation: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));
vi.mock("./proof-image-modal", () => ({ default: () => null }));
vi.mock("./text-proof-modal", () => ({ default: () => null }));

import type {
  ActivityDetailsWithParticipants,
  ParticipantWithUserAndProofs,
} from "@/app/lib/festivals/definitions";
import ActivityParticipantsTable from "./activity-participants-table";
import type { MoveTargetVariant } from "./move-participant-variant-menu";

const CREATED_AT = new Date("2026-09-01T12:00:00.000Z");

function detail(id: number) {
  return {
    id,
    activityId: 9,
    description: null,
    participationLimit: null,
    category: null,
  } as unknown as ActivityDetailsWithParticipants;
}

function participant(id: number, name: string, detailId: number) {
  return {
    id,
    detailsId: detailId,
    userId: id,
    removedAt: null,
    removalReason: null,
    updatedAt: CREATED_AT,
    createdAt: CREATED_AT,
    user: { id, displayName: name, imageUrl: null, category: "illustration" },
    proofs: [],
    detail: detail(detailId),
  } as unknown as ParticipantWithUserAndProofs & {
    detail: ActivityDetailsWithParticipants;
  };
}

const variants: MoveTargetVariant[] = [1, 2].map((id) => ({
  id,
  label: `Variante ${id}`,
  activeCount: 1,
  reservationExpiries: [],
  participationLimit: null,
  category: null,
}));

/** Both variants' tables, with `moved` listed in variant `movedTo`. */
function Page({ movedTo }: { movedTo: 1 | 2 | null }) {
  const inVariant = (detailId: number) => [
    participant(detailId * 10, `Fija ${detailId}`, detailId),
    ...(movedTo === detailId ? [participant(77, "Ana", detailId)] : []),
  ];
  return (
    <>
      {[1, 2].map((detailId) => (
        <ActivityParticipantsTable
          key={detailId}
          activityId={9}
          detailId={detailId}
          label={`Variante ${detailId}`}
          participants={inVariant(detailId)}
          materialLabel="material"
          variants={variants}
        />
      ))}
      <button type="button">Otro control</button>
    </>
  );
}

async function moveAnaToVariant2() {
  mocks.move.mockResolvedValue({
    success: true,
    message: "ok",
    revision: "2026-10-01T15:00:00.123Z",
    sourceActiveCount: 1,
  });
  const source = screen.getByRole("group", { name: "Variante 1" });
  fireEvent.keyDown(
    within(source).getAllByRole("button", {
      name: "Mover a Ana a otra variante",
    })[0],
    { key: "Enter" },
  );
  fireEvent.click(screen.getByRole("menuitem", { name: /Variante 2/ }));
  await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
}

describe("ActivityParticipantsTable focus after a move", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("focuses the moved row's Mover when the row is on screen", async () => {
    const { rerender } = render(<Page movedTo={1} />);
    await moveAnaToVariant2();

    // jsdom lays nothing out; pretend every row is visible.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
      {},
    ] as unknown as DOMRectList);
    rerender(<Page movedTo={2} />);

    const destination = screen.getByRole("group", { name: "Variante 2" });
    const active = document.activeElement as HTMLElement;
    expect(active.getAttribute("aria-label")).toBe(
      "Mover a Ana a otra variante",
    );
    expect(destination.contains(active)).toBe(true);
  });

  it("focuses the destination table when the moved row is hidden there", async () => {
    const { rerender } = render(<Page movedTo={1} />);
    await moveAnaToVariant2();

    // No layout in jsdom, so every row reads as filtered or paged out.
    rerender(<Page movedTo={2} />);

    const destination = screen.getByRole("group", { name: "Variante 2" });
    expect(document.activeElement).toBe(destination);

    // The request is spent: a later refresh leaves focus where the admin
    // put it.
    const other = screen.getByRole("button", { name: "Otro control" });
    other.focus();
    (document.activeElement as HTMLElement).blur();
    rerender(<Page movedTo={2} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("drops a request no table ever claims", async () => {
    const { rerender } = render(<Page movedTo={1} />);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await moveAnaToVariant2();

    // Someone else moved Ana elsewhere meanwhile: variant 2 never lists her.
    rerender(<Page movedTo={null} />);
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    (document.activeElement as HTMLElement | null)?.blur();

    rerender(<Page movedTo={2} />);
    expect(document.activeElement).toBe(document.body);
  });
});
