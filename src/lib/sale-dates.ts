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

export function resolveSaleDates(input: SaleDateInput) {
  const now = new Date();

  if (input.saleDateEthiopian) {
    const eth = parseEthiopianDateInput(input.saleDateEthiopian);
    const greg = ethiopianToGregorian(eth);
    return {
      saleDate: applyCurrentTimeToDate(greg, now),
      saleDateEthiopian: formatEthiopianDateInput(eth),
    };
  }

  if (input.saleDate) {
    const greg = parseLocalDateInput(input.saleDate);
    return {
      saleDate: applyCurrentTimeToDate(greg, now),
      saleDateEthiopian: formatEthiopianDateInput(gregorianToEthiopian(greg)),
    };
  }

  return {
    saleDate: now,
    saleDateEthiopian: getTodayEthiopianInputValue(),
  };
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
