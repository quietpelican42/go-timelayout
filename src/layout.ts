// Layout tokenizer and predefined layouts.
//
// Adapted from Go's time/format.go.
// Copyright 2010 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license, reproduced in
// LICENSE-go.

/** The reference time, in numerical order. */
export const Layout = "01/02 03:04:05PM '06 -0700";
export const ANSIC = 'Mon Jan _2 15:04:05 2006';
export const UnixDate = 'Mon Jan _2 15:04:05 MST 2006';
export const RubyDate = 'Mon Jan 02 15:04:05 -0700 2006';
export const RFC822 = '02 Jan 06 15:04 MST';
/** RFC822 with numeric zone. */
export const RFC822Z = '02 Jan 06 15:04 -0700';
export const RFC850 = 'Monday, 02-Jan-06 15:04:05 MST';
export const RFC1123 = 'Mon, 02 Jan 2006 15:04:05 MST';
/** RFC1123 with numeric zone. */
export const RFC1123Z = 'Mon, 02 Jan 2006 15:04:05 -0700';
export const RFC3339 = '2006-01-02T15:04:05Z07:00';
export const RFC3339Nano = '2006-01-02T15:04:05.999999999Z07:00';
export const Kitchen = '3:04PM';
export const Stamp = 'Jan _2 15:04:05';
export const StampMilli = 'Jan _2 15:04:05.000';
export const StampMicro = 'Jan _2 15:04:05.000000';
export const StampNano = 'Jan _2 15:04:05.000000000';
export const DateTime = '2006-01-02 15:04:05';
export const DateOnly = '2006-01-02';
export const TimeOnly = '15:04:05';

export const stdNeedDate = 1 << 8;
export const stdNeedYday = 1 << 9;
export const stdNeedClock = 1 << 10;
export const stdArgShift = 16;
export const stdSeparatorShift = 28;
export const stdMask = (1 << stdArgShift) - 1;

// The numeric values mirror the iota sequence in format.go.
export const stdLongMonth = 1 + stdNeedDate;
export const stdMonth = 2 + stdNeedDate;
export const stdNumMonth = 3 + stdNeedDate;
export const stdZeroMonth = 4 + stdNeedDate;
export const stdLongWeekDay = 5 + stdNeedDate;
export const stdWeekDay = 6 + stdNeedDate;
export const stdDay = 7 + stdNeedDate;
export const stdUnderDay = 8 + stdNeedDate;
export const stdZeroDay = 9 + stdNeedDate;
export const stdUnderYearDay = 10 + stdNeedYday;
export const stdZeroYearDay = 11 + stdNeedYday;
export const stdHour = 12 + stdNeedClock;
export const stdHour12 = 13 + stdNeedClock;
export const stdZeroHour12 = 14 + stdNeedClock;
export const stdMinute = 15 + stdNeedClock;
export const stdZeroMinute = 16 + stdNeedClock;
export const stdSecond = 17 + stdNeedClock;
export const stdZeroSecond = 18 + stdNeedClock;
export const stdLongYear = 19 + stdNeedDate;
export const stdYear = 20 + stdNeedDate;
export const stdPM = 21 + stdNeedClock;
export const stdpm = 22 + stdNeedClock;
export const stdTZ = 23;
export const stdISO8601TZ = 24;
export const stdISO8601SecondsTZ = 25;
export const stdISO8601ShortTZ = 26;
export const stdISO8601ColonTZ = 27;
export const stdISO8601ColonSecondsTZ = 28;
export const stdNumTZ = 29;
export const stdNumSecondsTz = 30;
export const stdNumShortTZ = 31;
export const stdNumColonTZ = 32;
export const stdNumColonSecondsTZ = 33;
export const stdFracSecond0 = 34;
export const stdFracSecond9 = 35;

const std0x = [stdZeroMonth, stdZeroDay, stdZeroHour12, stdZeroMinute, stdZeroSecond, stdYear];

export function isDigit(s: string, i: number): boolean {
  if (i >= s.length) return false;
  const c = s.charCodeAt(i);
  return c >= 0x30 && c <= 0x39;
}

function startsWithLowerCase(s: string): boolean {
  if (s.length === 0) return false;
  const c = s.charCodeAt(0);
  return c >= 0x61 && c <= 0x7a;
}

/** Packs the digit count and separator into a std value (stdFracSecond in Go). */
function stdFracSecond(code: number, n: number, c: string): number {
  if (c === '.') return code | ((n & 0xfff) << stdArgShift);
  return code | ((n & 0xfff) << stdArgShift) | (1 << stdSeparatorShift);
}

export function digitsLen(std: number): number {
  return (std >> stdArgShift) & 0xfff;
}

export function separator(std: number): string {
  return std >> stdSeparatorShift === 0 ? '.' : ',';
}

export type Chunk = [prefix: string, std: number, suffix: string];

/**
 * Finds the first std element in layout (a binary string) and returns the
 * text before it, the element, and the text after it.
 */
export function nextStdChunk(layout: string): Chunk {
  const n = layout.length;
  for (let i = 0; i < n; i++) {
    const c = layout[i];
    switch (c) {
      case 'J': // January, Jan
        if (layout.startsWith('Jan', i)) {
          if (layout.startsWith('January', i)) {
            return [layout.slice(0, i), stdLongMonth, layout.slice(i + 7)];
          }
          if (!startsWithLowerCase(layout.slice(i + 3))) {
            return [layout.slice(0, i), stdMonth, layout.slice(i + 3)];
          }
        }
        break;

      case 'M': // Monday, Mon, MST
        if (n >= i + 3) {
          if (layout.startsWith('Mon', i)) {
            if (layout.startsWith('Monday', i)) {
              return [layout.slice(0, i), stdLongWeekDay, layout.slice(i + 6)];
            }
            if (!startsWithLowerCase(layout.slice(i + 3))) {
              return [layout.slice(0, i), stdWeekDay, layout.slice(i + 3)];
            }
          }
          if (layout.startsWith('MST', i)) {
            return [layout.slice(0, i), stdTZ, layout.slice(i + 3)];
          }
        }
        break;

      case '0': // 01, 02, 03, 04, 05, 06, 002
        if (n >= i + 2 && layout[i + 1]! >= '1' && layout[i + 1]! <= '6') {
          return [layout.slice(0, i), std0x[layout.charCodeAt(i + 1) - 0x31]!, layout.slice(i + 2)];
        }
        if (n >= i + 3 && layout[i + 1] === '0' && layout[i + 2] === '2') {
          return [layout.slice(0, i), stdZeroYearDay, layout.slice(i + 3)];
        }
        break;

      case '1': // 15, 1
        if (n >= i + 2 && layout[i + 1] === '5') {
          return [layout.slice(0, i), stdHour, layout.slice(i + 2)];
        }
        return [layout.slice(0, i), stdNumMonth, layout.slice(i + 1)];

      case '2': // 2006, 2
        if (layout.startsWith('2006', i)) {
          return [layout.slice(0, i), stdLongYear, layout.slice(i + 4)];
        }
        return [layout.slice(0, i), stdDay, layout.slice(i + 1)];

      case '_': // _2, _2006, __2
        if (n >= i + 2 && layout[i + 1] === '2') {
          // _2006 is really a literal _, followed by stdLongYear
          if (layout.startsWith('2006', i + 1)) {
            return [layout.slice(0, i + 1), stdLongYear, layout.slice(i + 5)];
          }
          return [layout.slice(0, i), stdUnderDay, layout.slice(i + 2)];
        }
        if (n >= i + 3 && layout[i + 1] === '_' && layout[i + 2] === '2') {
          return [layout.slice(0, i), stdUnderYearDay, layout.slice(i + 3)];
        }
        break;

      case '3':
        return [layout.slice(0, i), stdHour12, layout.slice(i + 1)];
      case '4':
        return [layout.slice(0, i), stdMinute, layout.slice(i + 1)];
      case '5':
        return [layout.slice(0, i), stdSecond, layout.slice(i + 1)];

      case 'P': // PM
        if (n >= i + 2 && layout[i + 1] === 'M') {
          return [layout.slice(0, i), stdPM, layout.slice(i + 2)];
        }
        break;

      case 'p': // pm
        if (n >= i + 2 && layout[i + 1] === 'm') {
          return [layout.slice(0, i), stdpm, layout.slice(i + 2)];
        }
        break;

      case '-': // -070000, -07:00:00, -0700, -07:00, -07
        if (layout.startsWith('-070000', i)) {
          return [layout.slice(0, i), stdNumSecondsTz, layout.slice(i + 7)];
        }
        if (layout.startsWith('-07:00:00', i)) {
          return [layout.slice(0, i), stdNumColonSecondsTZ, layout.slice(i + 9)];
        }
        if (layout.startsWith('-0700', i)) {
          return [layout.slice(0, i), stdNumTZ, layout.slice(i + 5)];
        }
        if (layout.startsWith('-07:00', i)) {
          return [layout.slice(0, i), stdNumColonTZ, layout.slice(i + 6)];
        }
        if (layout.startsWith('-07', i)) {
          return [layout.slice(0, i), stdNumShortTZ, layout.slice(i + 3)];
        }
        break;

      case 'Z': // Z070000, Z07:00:00, Z0700, Z07:00, Z07
        if (layout.startsWith('Z070000', i)) {
          return [layout.slice(0, i), stdISO8601SecondsTZ, layout.slice(i + 7)];
        }
        if (layout.startsWith('Z07:00:00', i)) {
          return [layout.slice(0, i), stdISO8601ColonSecondsTZ, layout.slice(i + 9)];
        }
        if (layout.startsWith('Z0700', i)) {
          return [layout.slice(0, i), stdISO8601TZ, layout.slice(i + 5)];
        }
        if (layout.startsWith('Z07:00', i)) {
          return [layout.slice(0, i), stdISO8601ColonTZ, layout.slice(i + 6)];
        }
        if (layout.startsWith('Z07', i)) {
          return [layout.slice(0, i), stdISO8601ShortTZ, layout.slice(i + 3)];
        }
        break;

      case '.':
      case ',': // ,000, .000, ,999, .999 - repeated digits for fractional seconds
        if (i + 1 < n && (layout[i + 1] === '0' || layout[i + 1] === '9')) {
          const ch = layout[i + 1]!;
          let j = i + 1;
          while (j < n && layout[j] === ch) j++;
          // The string of digits must end here: only a fractional second is all digits.
          if (!isDigit(layout, j)) {
            const code = ch === '9' ? stdFracSecond9 : stdFracSecond0;
            return [layout.slice(0, i), stdFracSecond(code, j - (i + 1), c), layout.slice(j)];
          }
        }
        break;
    }
  }
  return [layout, 0, ''];
}
