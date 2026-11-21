import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import VolunteerSetupView from "@/app/components/volunteers/admin/volunteer-setup-view";
import type { VolunteerAdminCall } from "@/app/lib/volunteers/admin-definitions";

/**
 * /dashboard/festivals/[id]/volunteers/setup with v11's roles and shifts, for
 * checking the tables and their inline editors at phone and desktop widths
 * without the app or a database. Saving answers from the mocked actions.
 */

const at = (iso: string) => new Date(iso);

const ROLES: VolunteerAdminCall["roles"] = (
  [
    [
      "Acreditación y check-in de los visitantes y participantes",
      "Recibís en el ingreso al público y a los expositores del festival, y verificás su registro.",
      17,
    ],
    [
      "Orientación al público",
      "Respondés dudas y ayudás a ubicar stands, baños y actividades.",
      21,
    ],
    [
      "Apoyo a expositores",
      "Acompañás a ilustradores y emprendedores con lo que necesiten en su stand.",
      14,
    ],
    [
      "Montaje y desmontaje",
      "Armás y desarmás mesas, señalética y decoración antes y después del festival.",
      12,
    ],
    [
      "Fotografía y redes sociales",
      "Registrás el festival en fotos y videos para las redes de Glitter.",
      19,
    ],
    [
      "Actividades y talleres",
      "Preparás materiales y ayudás a que cada actividad empiece a tiempo.",
      13,
    ],
  ] as const
).map(([name, description, choiceCount], index) => ({
  id: index + 1,
  name,
  description,
  sortOrder: index + 1,
  isActive: true,
  choiceCount,
}));

const SHIFTS: VolunteerAdminCall["shifts"] = (
  [
    ["Montaje", "2026-12-18T19:00:00Z", "2026-12-18T23:00:00Z", 8, 14, 4],
    [
      "Terminar montaje",
      "2026-12-19T14:00:00Z",
      "2026-12-19T18:00:00Z",
      6,
      11,
      6,
    ],
    [
      "Festival (turno A)",
      "2026-12-19T17:30:00Z",
      "2026-12-19T21:30:00Z",
      10,
      29,
      7,
    ],
    [
      "Festival + cierre (turno B)",
      "2026-12-19T21:30:00Z",
      "2026-12-20T01:30:00Z",
      10,
      22,
      6,
    ],
    [
      "Festival (turno A)",
      "2026-12-20T17:30:00Z",
      "2026-12-20T21:30:00Z",
      10,
      26,
      5,
    ],
    [
      "Festival + desmontaje de mesas (turno B)",
      "2026-12-20T21:30:00Z",
      "2026-12-21T01:30:00Z",
      10,
      9,
      2,
    ],
  ] as const
).map(([label, start, end, needed, available, assigned], index) => ({
  id: index + 1,
  label,
  startsAt: at(start),
  endsAt: at(end),
  neededHeadcount: needed,
  sortOrder: index + 1,
  isActive: true,
  availableCount: available,
  assignedCount: assigned,
}));

const CALL: VolunteerAdminCall = {
  festival: { id: 11, name: "Glitter v11" },
  settings: {
    // 23:59 on Monday 30 November, La Paz.
    applicationsCloseAt: at("2026-12-01T03:59:00Z"),
    inductionDate: "2026-12-05",
    inductionTime: null,
  },
  roles: ROLES,
  shifts: SHIFTS,
  statusTotals: {
    all: 41,
    pending: 12,
    accepted: 21,
    waitlist: 4,
    rejected: 4,
  },
};

// Storybook's app-router mock lacks the layout context Next 16.4's
// `useRouter` reads (see stories/home/home-history-card.stories.tsx).
const storyRouter = {
  back: fn(),
  forward: fn(),
  refresh: fn(),
  push: fn(),
  replace: fn(),
  prefetch: fn(),
} as unknown as React.ContextType<typeof AppRouterContext>;

const meta = {
  title: "Volunteers/Admin/Setup",
  component: VolunteerSetupView,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: false } },
  decorators: [
    (Story) => (
      <AppRouterContext.Provider value={storyRouter}>
        <div className="-m-6 min-h-screen bg-background">
          <Story />
        </div>
      </AppRouterContext.Provider>
    ),
  ],
  args: { call: CALL },
} satisfies Meta<typeof VolunteerSetupView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {};

/** "Terminar montaje" open, with the notice for the 11 who chose it. */
export const EditingShift: Story = {
  args: { editingShift: 2 },
};

/**
 * An error under one field of a row: the dates card without a closing date,
 * and the open shift without a cupo. The field beside it stays put (rows are
 * top-aligned).
 */
export const ValidationErrors: Story = {
  args: { editingShift: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText(/Cierre de postulaciones/));
    await userEvent.click(
      canvas.getByRole("button", { name: "Guardar fechas" }),
    );
    await waitFor(() =>
      expect(
        canvas.getByText("Indicá la fecha y la hora de cierre."),
      ).toBeVisible(),
    );

    // Role queries skip the hidden layout (the table or the cards).
    await userEvent.clear(canvas.getByRole("spinbutton", { name: "Cupo" }));
    await userEvent.click(canvas.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(
        canvas
          .getAllByText("Indicá el cupo.")
          .some((error) => error.offsetParent !== null),
      ).toBe(true),
    );
  },
};

/** A new role's blank row at the top of "Roles". */
export const AddingRole: Story = {
  args: { editingRole: "new" },
};

/** One role and one shift switched off: muted rows, unchecked boxes. */
export const SomeInactive: Story = {
  args: {
    call: {
      ...CALL,
      roles: ROLES.map((role) =>
        role.id === 6 ? { ...role, isActive: false, choiceCount: 0 } : role,
      ),
      shifts: SHIFTS.map((shift) =>
        shift.id === 6 ? { ...shift, isActive: false } : shift,
      ),
    },
  },
};

/** No call yet: the dates card opens it; no roles or shifts so far. */
export const NoSettings: Story = {
  args: {
    call: {
      ...CALL,
      settings: null,
      roles: [],
      shifts: [],
    },
  },
};
