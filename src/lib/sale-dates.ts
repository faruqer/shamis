import {
  ethiopianToGregorian,
  formatEthiopianDateInput,
  getTodayEthiopianInputValue,
  gregorianToEthiopian,
  parseEthiopianDateInput,
} from "@/lib/ethiopian-calendar";
import { endOfLocalDay, parseLocalDateInput, startOfLocalDay } from "@/lib/utils";

export type SaleDateInput = {
  saleDate?: string;
  saleDateEthiopian?: string;
  saleTime?: string;
};

function applyCurrentTimeToDate(dateOnly: Date, timeSource = new Date()) {
  const result = startOfLocalDay(dateOnly);
  result.setHours(
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds()
  );
  return result;
}

function applyTimeToDate(dateOnly: Date, saleTime: string | undefined, fallback = new Date()) {
  if (saleTime && /^\d{1,2}:\d{2}$/.test(saleTime)) {
    const [hours, minutes] = saleTime.split(":").map(Number);
    const result = startOfLocalDay(dateOnly);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }
  return applyCurrentTimeToDate(dateOnly, fallback);
}

export function resolveSaleDates(input: SaleDateInput) {
  const now = new Date();

  if (input.saleDateEthiopian) {
    const eth = parseEthiopianDateInput(input.saleDateEthiopian);
    const greg = ethiopianToGregorian(eth);
    return {
      saleDate: applyTimeToDate(greg, input.saleTime, now),
      saleDateEthiopian: formatEthiopianDateInput(eth),
    };
  }

  if (input.saleDate) {
    const greg = parseLocalDateInput(input.saleDate);
    return {
      saleDate: applyTimeToDate(greg, input.saleTime, now),
      saleDateEthiopian: formatEthiopianDateInput(gregorianToEthiopian(greg)),
    };
  }

  return {
    saleDate: now,
    saleDateEthiopian: getTodayEthiopianInputValue(),
  };
}

export function getSaleTimeInputValue(date: Date | string) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "12:00";
  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

export function ensureSaleDateEthiopian(
  saleDate: Date,
  saleDateEthiopian?: string | null
) {
  if (saleDateEthiopian) return saleDateEthiopian;
  return formatEthiopianDateInput(gregorianToEthiopian(saleDate));
}

export function isEthiopianDateInRange(
  ethValue: string,
  startEth: string,
  endEth: string
) {
  const value = parseEthiopianDateInput(ethValue);
  const start = parseEthiopianDateInput(startEth);
  const end = parseEthiopianDateInput(endEth);
  const v = ethiopianToGregorian(value);
  const s = startOfLocalDay(ethiopianToGregorian(start));
  const e = endOfLocalDay(ethiopianToGregorian(end));
  return v >= s && v <= e;
}
