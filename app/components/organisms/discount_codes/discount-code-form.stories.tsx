import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, mocked, userEvent, waitFor, within } from "storybook/test";

import { createDiscountCode } from "@/app/lib/discount_codes/actions";
import DiscountCodeForm from "./discount-code-form";

const meta = {
  title: "Discount codes/Discount code form",
  component: DiscountCodeForm,
  args: {
    festivalsOptions: [
      { value: "4", label: "Glitter Primavera" },
      { value: "5", label: "Glitter Invierno" },
    ],
  },
} satisfies Meta<typeof DiscountCodeForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewCode: Story = {};

/**
 * Enter in the people search used to submit the whole form: the coupon was
 * created with only the people added so far, and the page moved on.
 */
export const EnterInThePeopleSearchDoesNotSubmit: Story = {
  play: async ({ canvasElement }) => {
    mocked(createDiscountCode).mockClear();
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByLabelText("Código"), "VIP2026");
    await userEvent.type(canvas.getByLabelText("Valor (%)"), "20");
    await userEvent.click(canvas.getByRole("button", { name: "1 mes" }));
    await userEvent.click(
      canvas.getByRole("radio", { name: /Usuarios específicos/ }),
    );

    const search = canvas.getByPlaceholderText(
      "Buscar por nombre, correo o #id",
    );
    await userEvent.type(search, "chee");
    await userEvent.click(
      await canvas.findByRole("button", { name: /Ana Cheese ·/ }),
    );

    // The form is valid at this point, so a submission would go through.
    await userEvent.type(search, "carla{Enter}");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(createDiscountCode).not.toHaveBeenCalled();
    expect(search).toHaveValue("carla");

    // The admin finishes and saves with the button.
    await userEvent.click(
      await canvas.findByRole("button", { name: /Carla Cheeseman ·/ }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Crear código" }));
    await waitFor(() =>
      expect(createDiscountCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "VIP2026",
          audience: "selected_users",
          userIds: [5, 6],
        }),
      ),
    );
  },
};
