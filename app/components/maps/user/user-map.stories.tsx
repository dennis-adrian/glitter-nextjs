import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ReservationMapStandDto } from "@/app/lib/reservations/dto";
import UserMap from "./user-map";

function stand(
  id: number,
  status: ReservationMapStandDto["effectiveStatus"],
  positionLeft: number,
  overrides: Partial<ReservationMapStandDto> = {},
): ReservationMapStandDto {
  return {
    id,
    label: "A",
    standNumber: id,
    effectiveStatus: status,
    status,
    positionLeft,
    positionTop: 4,
    width: 6,
    height: 6,
    standCategory: "illustration",
    participationType: "standard",
    price: 350,
    sharedPrice: null,
    eligibleSubcategoryIds: [],
    festivalSectorId: 1,
    standGroupId: null,
    isFullTableHalf: false,
    occupantKey: null,
    hasExternalOccupant: false,
    visibleParticipantSummaries: [],
    ...overrides,
  };
}

/** One stand per status, left to right as the legend reads. */
const stands = [
  stand(1, "available", 4),
  stand(2, "available", 12),
  stand(3, "held", 20),
  stand(4, "reserved", 28),
  stand(5, "confirmed", 36),
  stand(6, "disabled", 44),
];

const meta = {
  title: "Maps/UserMap",
  component: UserMap,
  args: {
    stands,
    selectedStandId: 2,
    profile: {
      id: 3,
      displayName: "Ada",
      category: "illustration",
      participationType: "standard",
      imageUrl: null,
    },
  },
  decorators: [
    (Story) => (
      <div className="h-[420px] max-w-[360px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UserMap>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Disponible, Seleccionado, En espera, Reservado, Ocupado, No disponible. */
export const EveryStatus: Story = {};

export const EveryStatusDark: Story = {
  globals: { theme: "dark" },
};
