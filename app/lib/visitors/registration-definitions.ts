/**
 * What the browser gets to know about a visitor during registration: enough
 * to greet them and show their tickets, never their stored record (email,
 * phone, birthdate, gender), which stays on the server.
 */

/** Online: any remaining festival day. Door: only today, at the venue. */
export type RegistrationMode = "online" | "door";

export type VisitorTicketView = {
  id: number;
  festivalId: number;
  date: Date;
  /** What the door scanner reads, e.g. "GLT-0042". */
  code: string;
  numberOfVisitors: number;
  status: "pending" | "checked_in";
  /** Issued through the door form rather than ahead of time. */
  isEventDayCreation: boolean;
};

export type VisitorRegistrationView = {
  firstName: string;
  /** First name and last initial, as printed on the ticket: "Camila R." */
  displayName: string;
  /** This festival's tickets, earliest first. */
  tickets: VisitorTicketView[];
};

/**
 * A refusal. `restart` means the visitor's step has expired (no email held,
 * no session) and they have to enter their email again.
 */
export type RegistrationFailure = {
  success: false;
  message: string;
  restart?: boolean;
};

export type StartRegistrationResult =
  | { success: true; status: "returning"; view: VisitorRegistrationView }
  | { success: true; status: "new" }
  | RegistrationFailure;

export type RegisterVisitorResult =
  | { success: true; view: VisitorRegistrationView }
  | RegistrationFailure;

export type ClaimTicketResult =
  | { success: true; message: string; view: VisitorRegistrationView }
  | RegistrationFailure;

export type TicketHistoryLinkResult = { success: boolean; message: string };

/** The festival details printed on a ticket. */
export type TicketFestivalView = {
  name: string;
  mascotUrl: string | null;
  locationLabel: string | null;
  address: string | null;
};
