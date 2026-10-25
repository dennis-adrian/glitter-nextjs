// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RecipientsCard from "@/app/components/comunicados/admin/composer/recipients-card";

vi.mock("@/app/lib/comunicados/actions", () => ({
  searchComunicadoPeopleAction: vi.fn(),
  previewSkippedPeopleAction: vi.fn(),
}));

function renderCard(previewError: string | null) {
  const onRetryPreview = vi.fn();
  const { container } = render(
    <RecipientsCard
      audience={{ festivals: [7], lists: [3], people: [12] }}
      names={{
        festivals: { 7: "Glitter Navidad 2026" },
        lists: { 3: { name: "Ilustración", kind: "filter", archived: false } },
        people: {
          12: {
            id: 12,
            name: "Ana Pérez",
            email: "ana@example.com",
            imageUrl: null,
            isAdmin: false,
            skipReason: null,
          },
        },
      }}
      festivals={[]}
      lists={[]}
      preview={null}
      previewStale={false}
      previewError={previewError}
      onRetryPreview={onRetryPreview}
      env="production"
      onAddFestival={vi.fn()}
      onAddList={vi.fn()}
      onAddPerson={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  return { onRetryPreview, container };
}

describe("RecipientsCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("waits for the counts with a placeholder on every row", () => {
    const { container } = renderCard(null);
    // Two lists, the people picked by name and the summary.
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });

  it("shows why the counts could not be read, with a way to ask again", () => {
    const { onRetryPreview, container } = renderCard(
      "No pudimos contar los destinatarios. Probá de nuevo.",
    );
    expect(
      screen.getByText("No pudimos contar los destinatarios. Probá de nuevo."),
    ).toBeTruthy();
    // No count is on its way: nothing pretends to load.
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetryPreview).toHaveBeenCalledTimes(1);
  });
});
