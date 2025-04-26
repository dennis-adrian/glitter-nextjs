import { DateTime } from "luxon";

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

export function getDaysInMonth(month: number, year: number) {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

export function getDaysOptions(month: number, year: number) {
  return Array.from({ length: getDaysInMonth(month, year) }, (_, i) => ({
    value: (i + 1).toString(),
    label: (i + 1).toString(),
  }));
}

export function getMonthsOptions() {
  return Array.from({ length: 12 }, (_, i) => ({
    value: (i + 1).toString(),
    label:
      DateTime.fromObject({ month: i + 1 })
        .toLocaleString({
          month: "short",
        })
        .charAt(0)
        .toUpperCase() +
      DateTime.fromObject({ month: i + 1 })
        .toLocaleString({
          month: "short",
        })
        .slice(1),
  }));
}

export function getYearsOptions() {
  return Array.from({ length: 100 }, (_, i) => ({
    value: (new Date().getFullYear() - 9 - i).toString(),
    label: (new Date().getFullYear() - 9 - i).toString(),
  }));
}
