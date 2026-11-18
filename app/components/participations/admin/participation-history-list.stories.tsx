import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";

import ParticipationHistoryList from "@/app/components/participations/admin/participation-history-list";
import type { AdminParticipationRow } from "@/app/lib/participations/admin-history";
import {
  previewParticipantTransferAction,
  transferReservationParticipationAction,
} from "@/app/lib/reservations/participant-transfer-actions";

const storyRouter = {
  back: fn(),
  forward: fn(),
  refresh: fn(),
  push: fn(),
  replace: fn(),
  prefetch: fn(),
} as unknown as React.ContextType<typeof AppRouterContext>;

function festival(
  id: number,
  name: string,
  start: string | null,
  days = 2,
): AdminParticipationRow["festival"] {
  const startDate = start ? new Date(start) : null;
  return {
    id,
    name,
    status: "archived",
    startDate,
    endDate: startDate
      ? new Date(startDate.getTime() + (days - 1) * 86_400_000)
      : null,
  };
}

/**
 * The worst case a phone has to fit: a long festival name, a full table, a
 * companion with a long name, and every status an admin needs to see.
 */
const ROWS: AdminParticipationRow[] = [
  {
    participationId: 1,
    reservationId: 7,
    status: "accepted",
    source: "user_reservation",
    isHolder: true,
    standLabel: "A12 y A13",
    standCount: 2,
    festival: festival(
      15,
      "Festicker 4ta Edición - Halloween Especial de Ilustración Independiente",
      "2026-10-10T14:00:00Z",
    ),
    companions: [
      {
        id: 9,
        name: "María Fernanda de los Ángeles Quispe Mamani",
        email: "mariafernanda@example.com",
      },
    ],
    joinedAt: new Date("2026-08-01T00:00:00Z"),
    reservationCreatedAt: new Date("2026-08-01T00:00:00Z"),
  },
  // A second stand in the same edition, booked the old way: as its own
  // reservation. It is listed inside that festival, not as another one.
  {
    participationId: 4,
    reservationId: 8,
    status: "accepted",
    source: "user_reservation",
    isHolder: true,
    standLabel: "G5",
    standCount: 1,
    festival: festival(12, "Glitter Vol 8", "2025-12-06T14:00:00Z"),
    companions: [],
    joinedAt: new Date("2025-10-03T00:00:00Z"),
    reservationCreatedAt: new Date("2025-10-03T00:00:00Z"),
  },
  {
    participationId: 2,
    reservationId: 6,
    status: "cancelled",
    source: "admin_assignment",
    isHolder: false,
    standLabel: "G4",
    standCount: 1,
    festival: festival(12, "Glitter Vol 8", "2025-12-06T14:00:00Z"),
    companions: [{ id: 10, name: "Leo", email: "leo@example.com" }],
    joinedAt: new Date("2025-10-01T00:00:00Z"),
    reservationCreatedAt: new Date("2025-10-01T00:00:00Z"),
  },
  {
    participationId: 3,
    reservationId: 5,
    status: "rejected",
    source: "user_reservation",
    isHolder: true,
    standLabel: "B2",
    standCount: 1,
    festival: festival(10, "Glitter Vol 7", null),
    companions: [],
    joinedAt: new Date("2025-05-01T00:00:00Z"),
    reservationCreatedAt: new Date("2025-05-01T00:00:00Z"),
  },
];

const meta = {
  title: "Admin/Participation history",
  component: ParticipationHistoryList,
  parameters: {
    // Storybook's app-router mock lacks the layout context Next 16.4's
    // `useRouter` reads, so the router is provided here instead.
    nextjs: { appDirectory: false },
  },
  decorators: [
    (Story) => (
      <AppRouterContext.Provider value={storyRouter}>
        <Story />
      </AppRouterContext.Provider>
    ),
  ],
  args: {
    rows: ROWS,
    userId: 1,
    userName: "Mafe",
    canTransfer: true,
  },
} satisfies Meta<typeof ParticipationHistoryList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three festivals, four reservations: Glitter Vol 8 had two stands. */
export const GlobalAdmin: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        "2 participaciones · Se listan 3 festivales y 4 reservas, incluidas las canceladas y rechazadas.",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("2 reservas en este festival"),
    ).toBeInTheDocument();
  },
};

/** Festival admins read the history but cannot move anything. */
export const FestivalAdmin: Story = {
  args: { canTransfer: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByRole("link", { name: "Ver reserva" }),
    ).toHaveLength(4);
    await expect(
      canvas.queryByRole("button", { name: /Transferir/ }),
    ).not.toBeInTheDocument();
  },
};

export const Empty: Story = { args: { rows: [] } };

/**
 * The whole decision: find the new account, read what moves and what stays,
 * leave a reason, confirm. The preview is the server's, so it carries the
 * warnings the command would act on.
 */
export const TransferDialog: Story = {
  play: async ({ canvasElement }) => {
    mocked(previewParticipantTransferAction).mockClear();
    mocked(transferReservationParticipationAction).mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getAllByRole("button", { name: /Transferir/ })[0],
    );

    const dialog = within(await within(document.body).findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Cuenta de destino"), "maría");
    await userEvent.click(
      await dialog.findByRole("button", { name: /María Fernanda/ }),
    );

    await dialog.findByText("Se va a mover a la cuenta de destino:");
    await expect(previewParticipantTransferAction).toHaveBeenCalledWith({
      reservationId: 7,
      fromUserId: 1,
      toUserId: 42,
    });
    await userEvent.type(
      dialog.getByLabelText("Motivo (opcional)"),
      "Perdió el acceso a su cuenta anterior",
    );
  },
};

export const TransferConfirmed: Story = {
  play: async (context) => {
    await TransferDialog.play!(context);
    const dialog = within(await within(document.body).findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Transferir participación" }),
    );
    await waitFor(() =>
      expect(transferReservationParticipationAction).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: 7,
          fromUserId: 1,
          toUserId: 42,
          note: "Perdió el acceso a su cuenta anterior",
        }),
      ),
    );
  },
};

export const TransferRefused: Story = {
  play: async ({ canvasElement }) => {
    mocked(previewParticipantTransferAction).mockResolvedValueOnce({
      success: false,
      code: "TRANSFER_TARGET_ALREADY_RESERVED",
      message:
        "La cuenta de destino ya tiene una reserva vigente en este festival. Resolvé esa reserva antes de transferir esta.",
    } as never);
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getAllByRole("button", { name: /Transferir/ })[0],
    );
    const dialog = within(await within(document.body).findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Cuenta de destino"), "mafe");
    await userEvent.click(
      await dialog.findByRole("button", { name: /Mafe Ilustra/ }),
    );
    await dialog.findByRole("alert");
    await expect(
      dialog.getByRole("button", { name: "Transferir participación" }),
    ).toBeDisabled();
  },
};

/**
 * A slow preview for the first pick must not land under the second one: the
 * admin would read one account's plan and confirm a transfer to another.
 */
export const SlowPreviewForAnEarlierPick: Story = {
  play: async ({ canvasElement }) => {
    mocked(previewParticipantTransferAction).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                success: true,
                message: "Vista previa lista",
                data: {
                  reservationId: 7,
                  festivalName: "Festicker",
                  status: "accepted",
                  from: { id: 1, name: "Mafe", email: "mafe@example.com" },
                  to: { id: 42, name: "María", email: "maria@example.com" },
                  plan: {
                    movesHolding: false,
                    enrollment: "none",
                    moves: ["Plan de la primera cuenta"],
                    warnings: [],
                  },
                },
              }),
            600,
          ),
        ),
    );

    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getAllByRole("button", { name: /Transferir/ })[0],
    );
    const dialog = within(await within(document.body).findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Cuenta de destino"), "maría");
    await userEvent.click(
      await dialog.findByRole("button", { name: /María Fernanda/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cambiar" }));
    await userEvent.type(dialog.getByLabelText("Cuenta de destino"), "mafe");
    await userEvent.click(
      await dialog.findByRole("button", { name: /Mafe Ilustra/ }),
    );

    await dialog.findByText("La participación en la reserva");
    // Past the slow answer for the first pick.
    await new Promise((resolve) => setTimeout(resolve, 900));
    await expect(
      dialog.queryByText("Plan de la primera cuenta"),
    ).not.toBeInTheDocument();
    await expect(dialog.getByText("Mafe Ilustra")).toBeInTheDocument();
  },
};
