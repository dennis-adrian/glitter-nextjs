import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { STORY_USERS } from "@/app/lib/discount_codes/__mocks__/actions";
import type { DiscountCodeUser } from "@/app/lib/discount_codes/definitions";
import AssignedUsersPicker from "./assigned-users-picker";

function Harness({ initial }: { initial: DiscountCodeUser[] }) {
  const [users, setUsers] = useState(initial);
  return (
    <div className="max-w-xl">
      <AssignedUsersPicker value={users} onChange={setUsers} max={500} />
    </div>
  );
}

const meta = {
  title: "Discount codes/Assigned users picker",
  component: Harness,
  args: { initial: STORY_USERS.slice(0, 4) },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

const PLACEHOLDER = "Buscar por nombre, correo o #id";

/** The floating results panel, found through what it always renders. */
function resultsPanel(canvasElement: HTMLElement) {
  const panel = canvasElement.querySelector<HTMLElement>(
    "[data-search-results]",
  );
  if (!panel) throw new Error("results panel not rendered");
  return panel;
}

export const WithPeopleAdded: Story = {};

export const Empty: Story = { args: { initial: [] } };

/**
 * The panel opens over the list of people already added. Each avatar there
 * is positioned (Next's fill image), and without a stacking order of its own
 * the panel let those paint through it.
 */
export const ResultsCoverTheList: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText(PLACEHOLDER), "chee");
    await canvas.findByRole("button", { name: /Carla Cheeseman/ });

    const panel = resultsPanel(canvasElement);
    const panelRect = panel.getBoundingClientRect();
    const covered = STORY_USERS.slice(0, 4)
      .map((user) =>
        canvas
          .getByRole("button", { name: `Quitar a ${user.displayName}` })
          .closest("li")!
          .querySelector("img")!
          .getBoundingClientRect(),
      )
      .map((rect) => ({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }))
      .filter(
        ({ x, y }) =>
          x > panelRect.left &&
          x < panelRect.right &&
          y > panelRect.top &&
          y < panelRect.bottom,
      );

    // Otherwise the check below proves nothing.
    expect(covered.length).toBeGreaterThan(0);
    for (const { x, y } of covered) {
      expect(panel.contains(document.elementFromPoint(x, y))).toBe(true);
    }
  },
};

/**
 * Picking someone closes the panel while the box keeps focus, so the next
 * name typed has to open it again without leaving the box first.
 */
export const ReopensForTheNextName: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByPlaceholderText(PLACEHOLDER);

    await userEvent.type(input, "chee");
    await userEvent.click(
      await canvas.findByRole("button", { name: /Ana Cheese ·/ }),
    );
    expect(
      canvas.getByRole("button", { name: "Quitar a Ana Cheese" }),
    ).toBeVisible();
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");

    await userEvent.type(input, "carla");
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: /Carla Cheeseman ·/ }),
      ).toBeVisible(),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: /Carla Cheeseman ·/ }),
    );
    expect(
      canvas.getByRole("button", { name: "Quitar a Carla Cheeseman" }),
    ).toBeVisible();
  },
};

/** Before anything is typed there is nothing to show, so nothing opens. */
export const StaysClosedUntilTyping: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByPlaceholderText(PLACEHOLDER));
    expect(resultsPanel(canvasElement)).not.toBeVisible();
  },
};

/** One letter is too short to search, which is not the same as no match. */
export const AsksForMoreThanOneLetter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText(PLACEHOLDER), "a");
    expect(
      await canvas.findByText("Escribí al menos 2 caracteres para buscar."),
    ).toBeVisible();
    expect(canvas.queryByText(/No se encontraron resultados/)).toBeNull();
  },
};

/** Someone already on the list shows up, but cannot be added twice. */
export const MarksPeopleAlreadyAdded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText(PLACEHOLDER), "pandas");
    const option = await canvas.findByRole("button", { name: /Pandas Draw ·/ });
    expect(option).toBeDisabled();
    expect(option).toHaveTextContent("Ya está en la lista");
  },
};
