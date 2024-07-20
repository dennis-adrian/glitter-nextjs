export function getMaxDateNumber(month: number, year: number) {
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month === 2) {
    if (isLeapYear) {
      return 29;
    }

    return 28;
  }

  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }

  return 31;
}

export function validatePhoneNumber(phoneNumber: string) {
  const isNumeric = phoneNumber.match(/^\d+$/);
  if (!isNumeric) return false;

  return phoneNumber.startsWith("6") || phoneNumber.startsWith("7");
}
