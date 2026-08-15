/**
 * Voucher submission rules and upload URL validation for FastPass.
 *
 * Re-exports pure state helpers from `state.ts` and the UploadThing host
 * check from paid programs, which uses the same storage vendor.
 */

export {
  resolveVoucherSubmission,
  VOUCHER_BLOCKER_LABELS,
  type VoucherBlocker,
  type VoucherSubmissionCheck,
  type VoucherSubmissionSubject,
} from "@/app/lib/fast-pass/state";

export { isAuthorizedVoucherUrl } from "@/app/lib/programs/vouchers";
