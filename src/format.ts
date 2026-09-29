// Format, adapted from Go's time/format.go.
// Copyright 2010 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license, reproduced in
// LICENSE-go.

import { fromBytes, toBytes } from './bytes.ts';
import { civilFromDays, daysFromCivil, secondsPerDay } from './civil.ts';
import * as L from './layout.ts';
import { fromDate, splitNanos, type GoTime } from './time.ts';

export const shortDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const longDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const longMonthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Decimal form of x, zero-padded to width digits after an optional '-'. */
function appendInt(x: number, width: number): string {
  const s = String(Math.abs(x));
  const pad = width > s.length ? '0'.repeat(width - s.length) : '';
  return (x < 0 ? '-' : '') + pad + s;
}

function appendNano(nanosec: number, std: number): string {
  const trim = (std & L.stdMask) === L.stdFracSecond9;
  const n = L.digitsLen(std);
  if (trim && (n === 0 || nanosec === 0)) return '';
  const dot = L.separator(std);
  let b = dot + appendInt(nanosec, 9);
  if (n < 9) b = b.slice(0, b.length - 9 + n);
  if (trim) {
    let end = b.length;
    while (end > 0 && b[end - 1] === '0') end--;
    b = b.slice(0, end);
    if (b.length > 0 && b[b.length - 1] === dot) b = b.slice(0, -1);
  }
  return b;
}

/**
 * Formats t according to a Go reference-time layout, like time.Time.Format.
 * A JS Date is formatted in UTC.
 */
export function format(t: GoTime | Date, layout: string): string {
  if (t instanceof Date) t = fromDate(t);
  const [unixSec, nsec] = splitNanos(t.epochNanos);
  const offset = t.offsetSeconds;
  const name = toBytes(t.zoneName);
  const abs = unixSec + offset;
  const days = Math.floor(abs / secondsPerDay);
  const secOfDay = abs - days * secondsPerDay;

  let year = -1;
  let month = 0;
  let day = 0;
  let yday = -1;
  let hour = -1;
  let min = 0;
  let sec = 0;
  let yearSet = false;

  let out = '';
  let rest = toBytes(layout);
  while (rest !== '') {
    const [prefix, std, suffix] = L.nextStdChunk(rest);
    out += prefix;
    if (std === 0) break;
    rest = suffix;

    // Go tests `year < 0`, which recomputes for negative years; the result is the same.
    if (!yearSet && (std & L.stdNeedDate) !== 0) {
      [year, month, day] = civilFromDays(days);
      yearSet = true;
    }
    if (yday < 0 && (std & L.stdNeedYday) !== 0) {
      const [y] = civilFromDays(days);
      yday = days - daysFromCivil(y, 1, 1) + 1;
    }
    if (hour < 0 && (std & L.stdNeedClock) !== 0) {
      hour = Math.floor(secOfDay / 3600);
      min = Math.floor((secOfDay % 3600) / 60);
      sec = secOfDay % 60;
    }

    switch (std & L.stdMask) {
      case L.stdYear & L.stdMask:
        out += appendInt(Math.abs(year) % 100, 2);
        break;
      case L.stdLongYear & L.stdMask:
        out += appendInt(year, 4);
        break;
      case L.stdMonth & L.stdMask:
        out += shortMonthNames[month - 1];
        break;
      case L.stdLongMonth & L.stdMask:
        out += longMonthNames[month - 1];
        break;
      case L.stdNumMonth & L.stdMask:
        out += appendInt(month, 0);
        break;
      case L.stdZeroMonth & L.stdMask:
        out += appendInt(month, 2);
        break;
      case L.stdWeekDay & L.stdMask:
        out += shortDayNames[(((days + 4) % 7) + 7) % 7];
        break;
      case L.stdLongWeekDay & L.stdMask:
        out += longDayNames[(((days + 4) % 7) + 7) % 7];
        break;
      case L.stdDay & L.stdMask:
        out += appendInt(day, 0);
        break;
      case L.stdUnderDay & L.stdMask:
        if (day < 10) out += ' ';
        out += appendInt(day, 0);
        break;
      case L.stdZeroDay & L.stdMask:
        out += appendInt(day, 2);
        break;
      case L.stdUnderYearDay & L.stdMask:
        if (yday < 100) {
          out += ' ';
          if (yday < 10) out += ' ';
        }
        out += appendInt(yday, 0);
        break;
      case L.stdZeroYearDay & L.stdMask:
        out += appendInt(yday, 3);
        break;
      case L.stdHour & L.stdMask:
        out += appendInt(hour, 2);
        break;
      case L.stdHour12 & L.stdMask:
        out += appendInt(hour % 12 === 0 ? 12 : hour % 12, 0);
        break;
      case L.stdZeroHour12 & L.stdMask:
        out += appendInt(hour % 12 === 0 ? 12 : hour % 12, 2);
        break;
      case L.stdMinute & L.stdMask:
        out += appendInt(min, 0);
        break;
      case L.stdZeroMinute & L.stdMask:
        out += appendInt(min, 2);
        break;
      case L.stdSecond & L.stdMask:
        out += appendInt(sec, 0);
        break;
      case L.stdZeroSecond & L.stdMask:
        out += appendInt(sec, 2);
        break;
      case L.stdPM & L.stdMask:
        out += hour >= 12 ? 'PM' : 'AM';
        break;
      case L.stdpm & L.stdMask:
        out += hour >= 12 ? 'pm' : 'am';
        break;
      case L.stdISO8601TZ:
      case L.stdISO8601ColonTZ:
      case L.stdISO8601SecondsTZ:
      case L.stdISO8601ShortTZ:
      case L.stdISO8601ColonSecondsTZ:
      case L.stdNumTZ:
      case L.stdNumColonTZ:
      case L.stdNumSecondsTz:
      case L.stdNumShortTZ:
      case L.stdNumColonSecondsTZ: {
        // The "Z" variants print "Z" at offset 0; the others are always numeric.
        if (
          offset === 0 &&
          (std === L.stdISO8601TZ ||
            std === L.stdISO8601ColonTZ ||
            std === L.stdISO8601SecondsTZ ||
            std === L.stdISO8601ShortTZ ||
            std === L.stdISO8601ColonSecondsTZ)
        ) {
          out += 'Z';
          break;
        }
        let zone = Math.trunc(offset / 60);
        let absoffset = offset;
        if (zone < 0) {
          out += '-';
          zone = -zone;
          absoffset = -absoffset;
        } else {
          out += '+';
        }
        out += appendInt(Math.trunc(zone / 60), 2);
        if (
          std === L.stdISO8601ColonTZ ||
          std === L.stdNumColonTZ ||
          std === L.stdISO8601ColonSecondsTZ ||
          std === L.stdNumColonSecondsTZ
        ) {
          out += ':';
        }
        if (std !== L.stdNumShortTZ && std !== L.stdISO8601ShortTZ) {
          out += appendInt(zone % 60, 2);
        }
        if (
          std === L.stdISO8601SecondsTZ ||
          std === L.stdNumSecondsTz ||
          std === L.stdNumColonSecondsTZ ||
          std === L.stdISO8601ColonSecondsTZ
        ) {
          if (std === L.stdNumColonSecondsTZ || std === L.stdISO8601ColonSecondsTZ) out += ':';
          out += appendInt(absoffset % 60, 2);
        }
        break;
      }
      case L.stdTZ: {
        if (name !== '') {
          out += name;
          break;
        }
        // No zone name known: print the numeric -0700 form.
        let zone = Math.trunc(offset / 60);
        if (zone < 0) {
          out += '-';
          zone = -zone;
        } else {
          out += '+';
        }
        out += appendInt(Math.trunc(zone / 60), 2);
        out += appendInt(zone % 60, 2);
        break;
      }
      case L.stdFracSecond0:
      case L.stdFracSecond9:
        out += appendNano(nsec, std);
        break;
    }
  }
  return fromBytes(out);
}
