import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { parseVolunteerAdminView } from "@/app/components/volunteers/admin/volunteer-admin-list-params";
import VolunteerAdminListView from "@/app/components/volunteers/admin/volunteer-admin-list-view";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import {
  VolunteerApplicationsSearchSchema,
  type VolunteerAdminCall,
  type VolunteerApplicationListItem,
  type VolunteerApplicationsPage,
} from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerApplicationStatus } from "@/app/lib/volunteers/definitions";

import { VolunteerAdminStoryContext } from "./volunteer-admin-story-context";

/**
 * /dashboard/festivals/[id]/volunteers with v11's roles and shifts, for
 * checking the layout at phone and desktop widths without the app or a
 * database. The row menu's status changes answer from the mocked actions.
 */

const at = (iso: string) => new Date(iso);
/** Pinned, so the ages and "cierra el" stay put. */
const TODAY = at("2026-11-21T16:00:00Z");

const ROLES: VolunteerAdminCall["roles"] = [
  "Acreditación y check-in de los visitantes y participantes",
  "Orientación al público",
  "Apoyo a expositores",
  "Montaje y desmontaje",
  "Fotografía y redes sociales",
  "Actividades y talleres",
].map((name, index) => ({
  id: index + 1,
  name,
  description: "",
  sortOrder: index + 1,
  isActive: true,
  choiceCount: [3, 2, 2, 3, 5, 1][index]!,
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
  // As if everyone assigned had marked it.
  unassignedAvailableCount: Math.max(available - assigned, 0),
}));

const roleName = (id: number) => ROLES.find((role) => role.id === id)!.name;

function application(
  id: number,
  fullName: string,
  status: VolunteerApplicationStatus,
  {
    birthdate,
    phone,
    email,
    roles: [first, second],
    available,
    assignedRole = null,
    assigned = [],
  }: {
    birthdate: string;
    phone: string;
    email: string;
    roles: [number, number];
    available: number[];
    assignedRole?: number | null;
    assigned?: number[];
  },
): VolunteerApplicationListItem {
  return {
    id,
    fullName,
    email,
    phone,
    birthdate,
    status,
    firstChoiceRoleId: first,
    secondChoiceRoleId: second,
    assignedRoleId: assignedRole,
    firstChoiceRoleName: roleName(first),
    secondChoiceRoleName: roleName(second),
    assignedRoleName: assignedRole ? roleName(assignedRole) : null,
    availableShiftIds: available,
    assignedShiftIds: assigned,
    createdAt: at(`2026-11-${String(10 + id).padStart(2, "0")}T15:00:00Z`),
  };
}

const ITEMS: VolunteerApplicationListItem[] = [
  application(1, "Camila Rojas", "pending", {
    birthdate: "2004-05-12",
    phone: "+591 70000001",
    email: "camila.rojas@example.com",
    roles: [5, 2],
    available: [1, 3, 4],
  }),
  application(
    2,
    "María Fernanda Quispe Mamani de la Cruz Villarroel",
    "accepted",
    {
      birthdate: "2007-08-30",
      phone: "+591 50000002",
      email: "maria.fernanda.quispe.mamani.delacruz.villarroel@example.com",
      roles: [5, 6],
      available: [3, 5],
      assignedRole: 5,
      assigned: [3, 5],
    },
  ),
  application(3, "Diego Alejandro Fernández", "accepted", {
    birthdate: "1999-02-03",
    phone: "+591 70000003",
    email: "diego.fernandez@example.com",
    roles: [4, 1],
    available: [1, 2, 3, 4, 5, 6],
    assignedRole: 4,
    assigned: [1, 2, 6],
  }),
  application(4, "Valentina Gutiérrez", "waitlist", {
    birthdate: "1995-10-10",
    phone: "+591 60000004",
    email: "vale.gutierrez@example.com",
    roles: [5, 3],
    available: [5, 6],
  }),
  application(5, "Luis", "rejected", {
    birthdate: "2002-01-20",
    phone: "+591 70000005",
    email: "luis@example.com",
    roles: [5, 1],
    available: [4],
  }),
  application(6, "Sofía Mendoza Arce", "pending", {
    birthdate: "2008-12-01",
    phone: "+591 71234567",
    email: "sofia.mendoza.arce@universidad.example.edu.bo",
    roles: [1, 2],
    available: [2, 3],
  }),
  application(7, "Andrés Choque", "pending", {
    birthdate: "2001-06-15",
    phone: "+591 76543210",
    email: "andres.choque@example.com",
    roles: [3, 4],
    available: [1, 2, 3, 4, 5, 6],
  }),
  application(8, "Paola Céspedes", "accepted", {
    birthdate: "1998-03-22",
    phone: "+591 78889990",
    email: "paola.cespedes@example.com",
    roles: [2, 6],
    available: [3, 4],
    assignedRole: null,
    assigned: [],
  }),
];

const TOTALS = { all: 8, pending: 3, accepted: 3, waitlist: 1, rejected: 1 };

const CALL: VolunteerAdminCall = {
  festival: { id: 11, name: "Glitter v11" },
  settings: {
    applicationsCloseAt: at("2026-12-01T03:59:00Z"),
    inductionDate: "2026-12-05",
    inductionTime: null,
  },
  roles: ROLES,
  shifts: SHIFTS,
  statusTotals: TOTALS,
};

function List({
  searchParams = {},
  page,
  call = CALL,
}: {
  searchParams?: RawSearchParams;
  page: VolunteerApplicationsPage | null;
  call?: VolunteerAdminCall;
}) {
  const view = parseVolunteerAdminView(searchParams);
  return (
    <VolunteerAdminStoryContext
      path={`/dashboard/festivals/${call.festival.id}/volunteers`}
      searchParams={searchParams}
    >
      <div className="-m-6">
        <VolunteerAdminListView
          call={call}
          page={page}
          filters={VolunteerApplicationsSearchSchema.parse(searchParams)}
          searchParams={searchParams}
          view={view}
          today={TODAY}
        />
      </div>
    </VolunteerAdminStoryContext>
  );
}

const meta = {
  title: "Volunteers/Admin/List",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: false } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithApplications: Story = {
  render: () => <List page={{ items: ITEMS, total: 8, counts: TOTALS }} />,
};

/** A phone, on the default "Postulaciones" view. */
export const PhoneApplications: Story = {
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <List page={{ items: ITEMS, total: 8, counts: TOTALS }} />,
};

/** A phone on "Cobertura": a tappable row per shift, no applications. */
export const PhoneCoverage: Story = {
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => (
    <List
      searchParams={{ view: "cobertura" }}
      page={{ items: ITEMS, total: 8, counts: TOTALS }}
    />
  ),
};

/** "Rol preferido" set, on page two of a longer list. */
export const FilteredByRole: Story = {
  render: () => {
    const items = ITEMS.filter(
      (item) => item.firstChoiceRoleId === 5 || item.secondChoiceRoleId === 5,
    );
    return (
      <List
        searchParams={{ roleId: "5", offset: "25" }}
        page={{
          items,
          total: 25 + items.length,
          counts: {
            all: 29,
            pending: 12,
            accepted: 9,
            waitlist: 4,
            rejected: 4,
          },
        }}
      />
    );
  },
};

export const EmptyFilter: Story = {
  render: () => (
    <List
      searchParams={{ status: "waitlist", query: "zzz", shiftId: "6" }}
      page={{
        items: [],
        total: 0,
        counts: { all: 0, pending: 0, accepted: 0, waitlist: 0, rejected: 0 },
      }}
    />
  ),
};

export const NoSettings: Story = {
  render: () => (
    <List
      call={{
        ...CALL,
        settings: null,
        roles: [],
        shifts: [],
        statusTotals: {
          all: 0,
          pending: 0,
          accepted: 0,
          waitlist: 0,
          rejected: 0,
        },
      }}
      page={null}
    />
  ),
};
