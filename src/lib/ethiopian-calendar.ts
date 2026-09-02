/** Ethiopian calendar — Intl for Gregorian→EC, inverse search for EC→Gregorian. */

export interface EthiopianDateParts {
  year: number;
  month: number;
  day: number;
}

export const ETHIOPIAN_MONTHS = [
  "Meskerem",
  "Tikimt",
  "Hidar",
  "Tahsas",
  "Tir",
  "Yekatit",
  "Megabit",
  "Miyazya",
  "Ginbot",
  "Sene",
  "Hamle",
  "Nehase",
  "Pagume",
] as const;

const EC_FORMATTER = new Intl.DateTimeFormat("en-US-u-ca-ethiopic", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function parseIntlEthiopian(date: Date): EthiopianDateParts {
  const parts = EC_FORMATTER.formatToParts(date);
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      values[part.type] = Number(part.value);
    }
  }
  if (!values.year || !values.month || !values.day) {
    throw new Error("Failed to parse Ethiopian date");
  }
  return { year: values.year, month: values.month, day: values.day };
}

export function gregorianToEthiopian(date: Date): EthiopianDateParts {
  return parseIntlEthiopian(date);
}

export function ethiopianToGregorian(parts: EthiopianDateParts): Date {
  const gregYearGuess = parts.year + 7;
  const start = new Date(gregYearGuess, 8, 1);
  const end = new Date(gregYearGuess + 1, 10, 30);

  for (let time = start.getTime(); time <= end.getTime(); time += 86400000) {
    const candidate = new Date(time);
    const eth = gregorianToEthiopian(candidate);
    if (eth.year === parts.year && eth.month === parts.month && eth.day === parts.day) {
      return new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
    }
  }

  throw new Error("Invalid Ethiopian date");
}

export function isEthiopianLeapYear(year: number) {
  try {
    ethiopianToGregorian({ year, month: 13, day: 6 });
    return true;
  } catch {
    return false;
  }
}

export function daysInEthiopianMonth(year: number, month: number) {
  if (month < 13) return 30;
  return isEthiopianLeapYear(year) ? 6 : 5;
}

export function formatEthiopianDateInput(parts: EthiopianDateParts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseEthiopianDateInput(value: string): EthiopianDateParts {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) {
    throw new Error("Invalid Ethiopian date");
  }
  const maxDay = daysInEthiopianMonth(y, m);
  if (m < 1 || m > 13 || d < 1 || d > maxDay) {
    throw new Error("Invalid Ethiopian date");
  }
  return { year: y, month: m, day: d };
}

function isEthiopianDateParts(value: Date | string | EthiopianDateParts): value is EthiopianDateParts {
  return (
    typeof value === "object" &&
    !(value instanceof Date) &&
    "year" in value &&
    "month" in value &&
    "day" in value
  );
}

export function formatEthiopianDateLong(date: Date | string | EthiopianDateParts) {
  const parts = isEthiopianDateParts(date)
    ? date
    : typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? parseEthiopianDateInput(date)
      : gregorianToEthiopian(date instanceof Date ? date : new Date(date));
  const monthName = ETHIOPIAN_MONTHS[parts.month - 1] ?? String(parts.month);
  return `${monthName} ${parts.day}, ${parts.year}`;
}

export function formatEthiopianDateShort(parts: EthiopianDateParts) {
  const monthName = ETHIOPIAN_MONTHS[parts.month - 1] ?? String(parts.month);
  return `${parts.day} ${monthName} ${parts.year}`;
}

export function getTodayEthiopianInputValue() {
  return formatEthiopianDateInput(gregorianToEthiopian(new Date()));
}

export function getCurrentEthiopianYear() {
  return gregorianToEthiopian(new Date()).year;
}

export function ethiopianInputToGregorianInput(ethValue: string) {
  const parts = parseEthiopianDateInput(ethValue);
  const greg = ethiopianToGregorian(parts);
  const y = greg.getFullYear();
  const m = String(greg.getMonth() + 1).padStart(2, "0");
  const d = String(greg.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function gregorianInputToEthiopianInput(gregValue: string) {
  const [y, m, d] = gregValue.split("-").map(Number);
  return formatEthiopianDateInput(gregorianToEthiopian(new Date(y, m - 1, d)));
}
