/**
 * The two mailings a festival sends to a whole list at once:
 *
 * - `visitor_registration`: every visitor of past festivals, invited to get
 *   their free ticket once acreditación opens.
 * - `participant_activation`: every verified participant of the festival's
 *   categories, told the festival is on and when reservations open.
 */
export const INVITATION_KINDS = [
  "visitor_registration",
  "participant_activation",
] as const;

export type InvitationKind = (typeof INVITATION_KINDS)[number];

/**
 * Who a mailing would reach right now. Counts only: the browser never needs
 * the addresses themselves.
 */
export type InvitationAudience = {
  /** People the mailing would be sent to. */
  recipients: number;
  /** Visitors left out because they already hold a ticket for this festival. */
  alreadyRegistered: number;
  /** Rows left out because their address cannot receive mail. */
  invalidEmails: number;
};

export type InvitationAudienceResult =
  | { success: true; audience: InvitationAudience }
  | { success: false; message: string };

export type InvitationPageFailure = {
  /** The cursor that page was read from; send it again to retry the page. */
  cursor: number;
  /** Recipients on the page; 0 for a call that never reached Resend. */
  count: number;
  message: string;
  /**
   * Set by the browser for a call that never completed: whether retrying it
   * should carry on to the end of the list.
   */
  follow?: boolean;
};

export type InvitationBatchResult =
  | {
      success: true;
      sent: number;
      failed: number;
      skipped: number;
      failures: InvitationPageFailure[];
      /** Where the next call resumes, or null once every page was read. */
      nextCursor: number | null;
      /** Outside production nothing is mailed; the counts are what would be. */
      simulated: boolean;
    }
  | { success: false; message: string };
