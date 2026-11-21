import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { volunteerCoverageHref } from "@/app/components/volunteers/admin/volunteer-admin-list-params";
import VolunteerShiftDetailView from "@/app/components/volunteers/admin/volunteer-shift-detail-view";
import type {
  VolunteerShiftAssignee,
  VolunteerShiftCandidate,
  VolunteerShiftDetail,
} from "@/app/lib/volunteers/admin-definitions";

import { VolunteerAdminStoryContext } from "./volunteer-admin-story-context";

/**
 * /dashboard/festivals/[id]/volunteers/shifts/[shiftId]: v11's Saturday
 * "turno A", for checking the layout at phone and desktop widths. "Asignar"
 * and "Quitar" answer from the mocked actions.
 */

const ROLES = [
  "Acreditación y check-in de los visitantes y participantes",
  "Orientación al público",
  "Apoyo a expositores",
  "Montaje y desmontaje",
  "Fotografía y redes sociales",
  "Actividades y talleres",
];

const SHIFT: VolunteerShiftDetail["shift"] = {
  id: 3,
  label: "Festival (turno A)",
  startsAt: new Date("2026-12-19T17:30:00Z"),
  endsAt: new Date("2026-12-19T21:30:00Z"),
  neededHeadcount: 10,
  sortOrder: 3,
  isActive: true,
  availableCount: 29,
  assignedCount: 7,
  // CANDIDATES below.
  unassignedAvailableCount: 10,
};

const ASSIGNEES: VolunteerShiftAssignee[] = (
  [
    ["Camila Rojas", 4],
    ["Diego Alejandro Fernández", 3],
    ["María Fernanda Quispe Mamani de la Cruz Villarroel", 0],
    ["Paola Céspedes", null],
    ["Sofía Mendoza Arce", 1],
    ["Andrés Choque", 2],
    ["Luciana Paz", 1],
  ] as const
).map(([fullName, role], index) => ({
  applicationId: index + 1,
  fullName,
  status: "accepted" as const,
  assignedRoleName: role === null ? null : ROLES[role]!,
}));

const CANDIDATES: VolunteerShiftCandidate[] = (
  [
    ["Hernán Vargas", "accepted", 1, 2, 0],
    ["Carla Gutiérrez", "accepted", 4, 3, 2],
    ["Rodrigo Alanoca Choquehuanca", "accepted", 0, 1, 1],
    ["Ana Belén Torrez", "pending", 4, 1, 0],
    ["Bruno", "pending", 3, 5, 1],
    ["Daniela Villca", "pending", 1, 2, 2],
    ["Esteban Quiroga", "pending", 0, 5, 0],
    ["Fabiola Mamani", "pending", 2, 3, 0],
    ["Gonzalo Ríos", "pending", 5, 0, 0],
    ["Valentina Gutiérrez", "waitlist", 4, 2, 0],
  ] as const
).map(([fullName, status, first, second, day], index) => ({
  applicationId: 100 + index,
  fullName,
  status,
  firstChoiceRoleName: ROLES[first]!,
  secondChoiceRoleName: ROLES[second]!,
  shiftsThatDay: day,
}));

const DETAIL: VolunteerShiftDetail = {
  festival: { id: 11, name: "Glitter v11" },
  shift: SHIFT,
  assignees: ASSIGNEES,
  candidates: CANDIDATES,
};

function Shift({ detail = DETAIL }: { detail?: VolunteerShiftDetail }) {
  return (
    <VolunteerAdminStoryContext
      path={`/dashboard/festivals/${detail.festival.id}/volunteers/shifts/${detail.shift.id}`}
      title="Sáb 19 dic · 13:30–17:30"
      backHref={volunteerCoverageHref(detail.festival.id)}
    >
      <div className="-m-6">
        <VolunteerShiftDetailView detail={detail} />
      </div>
    </VolunteerAdminStoryContext>
  );
}

const meta = {
  title: "Volunteers/Admin/Shift",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: false } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <Shift /> };

export const Phone: Story = {
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <Shift />,
};

/** Nobody assigned or available, on a shift that was turned off. */
export const EmptyInactive: Story = {
  render: () => (
    <Shift
      detail={{
        ...DETAIL,
        shift: {
          ...SHIFT,
          isActive: false,
          assignedCount: 0,
          availableCount: 0,
          unassignedAvailableCount: 0,
        },
        assignees: [],
        candidates: [],
      }}
    />
  ),
};

/** Full, with a waitlisted person still holding the shift. */
export const Complete: Story = {
  render: () => (
    <Shift
      detail={{
        ...DETAIL,
        shift: { ...SHIFT, neededHeadcount: 7 },
        assignees: [
          ...ASSIGNEES,
          {
            applicationId: 99,
            fullName: "Valeria Siles",
            status: "waitlist",
            assignedRoleName: null,
          },
        ],
      }}
    />
  ),
};
