import { PhoneNumberUtil } from "google-libphonenumber";

const phoneUtil = PhoneNumberUtil.getInstance();

/**
 * Bolivian mobile numbers that libphonenumber does not recognise yet.
 *
 * `5`-prefixed mobiles were allocated recently and the metadata has not caught
 * up. Verified against google-libphonenumber 3.2.40 (installed) and 3.2.44
 * (latest at the time of writing): both accept `50…` but reject `51…`–`59…`,
 * so upgrading does not fix it and the range is allowed here instead.
 *
 * Deliberately narrow — country code 591, a leading 5, exactly 8 national
 * digits, which is the shape Bolivian mobiles have. Everything else still goes
 * through libphonenumber, so this cannot loosen validation for other countries.
 *
 * Remove once the library covers the range; `phone-validator.test.ts` pins the
 * behaviour either way.
 */
const BOLIVIA_UNRECOGNISED_MOBILE = /^\+5915\d{7}$/;

function isUnrecognisedBolivianMobile(phone: string): boolean {
  return BOLIVIA_UNRECOGNISED_MOBILE.test(phone.replace(/[\s()\-.]/g, ""));
}

export const isPhoneValid = (phone: string) => {
  try {
    if (phoneUtil.isValidNumber(phoneUtil.parseAndKeepRawInput(phone))) {
      return true;
    }
  } catch {
    // Fall through: an unparseable string can still match a known-good local
    // range that the library rejects outright.
  }

  return isUnrecognisedBolivianMobile(phone);
};
