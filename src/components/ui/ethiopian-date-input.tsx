"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  daysInEthiopianMonth,
  ETHIOPIAN_MONTHS,
  formatEthiopianDateInput,
  formatEthiopianDateLong,
  getCurrentEthiopianYear,
  getTodayEthiopianInputValue,
  gregorianToEthiopian,
  parseEthiopianDateInput,
  type EthiopianDateParts,
} from "@/lib/ethiopian-calendar";

interface EthiopianDateInputProps {
  value: string;
  onChange: (ethiopianValue: string) => void;
  label?: string;
  id?: string;
  className?: string;
  hideSummary?: boolean;
}

function clampParts(parts: EthiopianDateParts): EthiopianDateParts {
  const maxDay = daysInEthiopianMonth(parts.year, parts.month);
  return {
    year: parts.year,
    month: parts.month,
    day: Math.min(parts.day, maxDay),
  };
}

export function EthiopianDateInput({
  value,
  onChange,
  label = "Date",
  id,
  className,
  hideSummary = false,
}: EthiopianDateInputProps) {
  const parsed = useMemo(() => {
    try {
      return parseEthiopianDateInput(value);
    } catch {
      return gregorianToEthiopian(new Date());
    }
  }, [value]);

  const [parts, setParts] = useState<EthiopianDateParts>(parsed);

  useEffect(() => {
    setParts(parsed);
  }, [parsed.year, parsed.month, parsed.day]);

  const yearOptions = useMemo(() => {
    const current = getCurrentEthiopianYear();
    const years: number[] = [];
    for (let y = current - 10; y <= current + 1; y += 1) {
      years.push(y);
    }
    return years;
  }, []);

  const maxDay = daysInEthiopianMonth(parts.year, parts.month);

  function emit(next: EthiopianDateParts) {
    const clamped = clampParts(next);
    setParts(clamped);
    onChange(formatEthiopianDateInput(clamped));
  }

  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
      )}
      <div className="mt-1 grid grid-cols-3 gap-2">
        <Select
          id={id}
          value={String(parts.year)}
          onChange={(e) => emit({ ...parts, year: Number(e.target.value) })}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
        <Select
          value={String(parts.month)}
          onChange={(e) => emit({ ...parts, month: Number(e.target.value) })}
        >
          {ETHIOPIAN_MONTHS.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          value={String(parts.day)}
          onChange={(e) => emit({ ...parts, day: Number(e.target.value) })}
        >
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </Select>
      </div>
      {!hideSummary && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{formatEthiopianDateLong(parts)}</p>
      )}
    </div>
  );
}

export function getDefaultEthiopianFilterDate() {
  return getTodayEthiopianInputValue();
}
