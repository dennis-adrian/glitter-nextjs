/**
 * Shape of the committed festival fixture.
 *
 * The fixture mirrors the structure of real festivals — sectors, stand layout,
 * reservation and payment outcomes — so local and staging environments can be
 * tested against realistic scenarios instead of a handful of synthetic rows.
 *
 * It carries no personal data. Everything identifying a real participant is
 * replaced during extraction: emails become undeliverable `@example.test`
 * addresses, names are generated, and phone numbers, photos, bios, Clerk ids
 * and payment vouchers are dropped. Only the shape of the data survives.
 *
 * Dates are stored as offsets in days from each festival's own start date, and
 * materialised relative to `now` at seed time. A fixture with absolute dates
 * would read as broken a month after it was written.
 */

export type FixtureUser = {
  /** Stable key within the fixture; remapped to real ids on insert. */
  ref: number;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  category: string;
  participationType: string;
  country: string | null;
  /** Days from the festival start; negative is before. */
  verifiedAtOffset: number | null;
  subcategoryRefs: number[];
};

export type FixtureStand = {
  ref: number;
  sectorRef: number;
  label: string | null;
  standNumber: number;
  status: string;
  standCategory: string;
  participationType: string;
  zone: string;
  orientation: string | null;
  width: number | null;
  height: number | null;
  positionLeft: number | null;
  positionTop: number | null;
  price: number;
  individualPrice: number;
  sharedPrice: number | null;
  groupRef: number | null;
  subcategoryRefs: number[];
};

export type FixtureReservation = {
  ref: number;
  standRef: number;
  status: string;
  source: string;
  ownerRef: number | null;
  priceAmountSnapshot: number | null;
  individualPriceSnapshot: number | null;
  sharedPriceSnapshot: number | null;
  bookedParticipantCount: number;
  createdAtOffset: number;
  revealAtOffset: number | null;
  participantRefs: number[];
  members: Array<{ standRef: number; position: number; released: boolean }>;
  invoice: FixtureInvoice | null;
};

export type FixtureInvoice = {
  amount: number;
  originalAmount: number;
  discountAmount: number;
  status: string;
  userRef: number;
  dateOffset: number;
  dueAtOffset: number | null;
  payments: Array<{
    amount: number;
    dateOffset: number;
    uploadedByRef: number | null;
  }>;
};

export type FixtureFestival = {
  name: string;
  description: string | null;
  festivalType: string;
  status: string;
  locationLabel: string | null;
  address: string | null;
  publicRegistration: boolean;
  eventDayRegistration: boolean;
  keepStoreOpen: boolean;
  participantTermsEnabled: boolean;
  reservationHoldMinutes: number;
  /** Days from `now` to this festival's start date. Negative is in the past. */
  startsInDays: number;
  /** Length of the festival in days. */
  durationDays: number;
  reservationsStartOffset: number | null;
  dates: Array<{ startOffset: number; endOffset: number }>;
  sectors: Array<{
    ref: number;
    name: string;
    description: string | null;
    orderInFestival: number;
    mapOriginX: number | null;
    mapOriginY: number | null;
    mapWidth: number | null;
    mapHeight: number | null;
    mapElements: Array<{
      type: string;
      label: string | null;
      labelPosition: string;
      labelFontSize: number;
      labelFontWeight: string | null;
      showIcon: boolean;
      positionLeft: number | null;
      positionTop: number | null;
      width: number | null;
      height: number | null;
      rotation: number;
    }>;
  }>;
  standGroups: Array<{ ref: number; sectorRef: number; type: string }>;
  stands: FixtureStand[];
  enrollments: Array<{ userRef: number; type: string; status: string }>;
  reservations: FixtureReservation[];
};

export type FestivalFixture = {
  /** Bumped when the shape changes so a stale fixture fails loudly. */
  version: 1;
  generatedFrom: string;
  users: FixtureUser[];
  /** Subcategory names, resolved to ids in the target database by name. */
  subcategories: Array<{ ref: number; name: string; category: string }>;
  festivals: FixtureFestival[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Turns a stored day offset into a real date relative to an anchor. */
export function offsetToDate(anchor: Date, offsetDays: number): Date {
  return new Date(anchor.getTime() + offsetDays * DAY_MS);
}

/** Days between two dates, kept fractional so times of day survive. */
export function dateToOffset(anchor: Date, value: Date): number {
  return (value.getTime() - anchor.getTime()) / DAY_MS;
}
