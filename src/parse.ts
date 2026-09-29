// Parse, adapted from Go's time/format.go.
// Copyright 2010 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license, reproduced in
// LICENSE-go.

import { fromBytes, quote, toBytes } from './bytes.ts';
import { daysBefore, daysIn, isLeap } from './civil.ts';
import { newParseError, type ParseError } from './errors.ts';
import { longDayNames, longMonthNames, shortDayNames, shortMonthNames } from './format.ts';
import * as L from './layout.ts';
import { fixedZone, UTC, type Location } from './location.ts';
import { dateToUnix, fromUnix, type GoTime } from './time.ts';

export interface ParseOptions {
  /**
   * Location for input with no zone information, and the location searched for
   * zone offsets and abbreviations. Equivalent to Go's ParseInLocation.
   * Without it the behavior is Go's Parse, with UTC as the local zone.
   */
  location?: Location;
}

const isDigitAt = L.isDigit;

// Go's errBad, threaded as a boolean.
type Num = [n: number, rest: string, bad: boolean];

/** match reports whether s1 and s2 match ignoring ASCII case; same length assumed. */
function match(s1: string, s2: string): boolean {
  for (let i = 0; i < s1.length; i++) {
    let c1 = s1.charCodeAt(i);
    let c2 = s2.charCodeAt(i);
    if (c1 !== c2) {
      c1 |= 0x20;
      c2 |= 0x20;
      if (c1 !== c2 || c1 < 0x61 || c1 > 0x7a) return false;
    }
  }
  return true;
}

function lookup(tab: string[], val: string): [number, string, boolean] {
  for (let i = 0; i < tab.length; i++) {
    const v = tab[i]!;
    if (val.length >= v.length && match(val.slice(0, v.length), v)) return [i, val.slice(v.length), false];
  }
  return [-1, val, true];
}

const MAX_I63 = 1n << 63n;

/** leadingInt consumes the leading [0-9]*; ok is false on uint64 overflow (as Go). */
function leadingInt(s: string): [x: number, rest: string, ok: boolean] {
  let i = 0;
  while (i < s.length && s.charCodeAt(i) >= 0x30 && s.charCodeAt(i) <= 0x39) i++;
  if (i <= 15) return [i === 0 ? 0 : Number(s.slice(0, i)), s.slice(i), true];
  let x = 0n;
  for (let k = 0; k < i; k++) {
    if (x > MAX_I63 / 10n) return [0, '', false];
    x = x * 10n + BigInt(s.charCodeAt(k) - 0x30);
    if (x > MAX_I63) return [0, '', false];
  }
  return [Number(x), s.slice(i), true];
}

/** Go's atoi: optional sign, then all digits. An empty digit string yields 0. */
function atoi(s: string): [x: number, ok: boolean] {
  let neg = false;
  if (s.length > 0 && (s[0] === '-' || s[0] === '+')) {
    neg = s[0] === '-';
    s = s.slice(1);
  }
  const [q, rem, ok] = leadingInt(s);
  if (!ok || rem.length > 0) return [0, false];
  return [neg ? -q : q, true];
}

function getnum(s: string, fixed: boolean): Num {
  if (!isDigitAt(s, 0)) return [0, s, true];
  if (!isDigitAt(s, 1)) {
    if (fixed) return [0, s, true];
    return [s.charCodeAt(0) - 0x30, s.slice(1), false];
  }
  return [(s.charCodeAt(0) - 0x30) * 10 + (s.charCodeAt(1) - 0x30), s.slice(2), false];
}

function getnum3(s: string, fixed: boolean): Num {
  let n = 0;
  let i = 0;
  for (; i < 3 && isDigitAt(s, i); i++) n = n * 10 + (s.charCodeAt(i) - 0x30);
  if (i === 0 || (fixed && i !== 3)) return [0, s, true];
  return [n, s.slice(i), false];
}

function cutspace(s: string): string {
  let i = 0;
  while (i < s.length && s[i] === ' ') i++;
  return s.slice(i);
}

/** Removes prefix from value, treating runs of spaces as equivalent. Returns the (possibly partial) value. */
function skip(value: string, prefix: string): [string, boolean] {
  while (prefix.length > 0) {
    if (prefix[0] === ' ') {
      if (value.length > 0 && value[0] !== ' ') return [value, true];
      prefix = cutspace(prefix);
      value = cutspace(value);
      continue;
    }
    if (value.length === 0 || value[0] !== prefix[0]) return [value, true];
    prefix = prefix.slice(1);
    value = value.slice(1);
  }
  return [value, false];
}

const commaOrPeriod = (c: string | undefined): boolean => c === '.' || c === ',';

function parseNanoseconds(value: string, nbytes: number): [ns: number, rangeErr: string, bad: boolean] {
  if (!commaOrPeriod(value[0])) return [0, '', true];
  if (nbytes > 10) {
    value = value.slice(0, 10);
    nbytes = 10;
  }
  let [ns, ok] = atoi(value.slice(1, nbytes));
  if (!ok) return [ns, '', true];
  if (ns < 0) return [ns, 'fractional second', false];
  const scaleDigits = 10 - nbytes;
  for (let i = 0; i < scaleDigits; i++) ns *= 10;
  return [ns, '', false];
}

function parseSignedOffset(value: string): number {
  const sign = value[0];
  if (sign !== '-' && sign !== '+') return 0;
  const [x, rem, ok] = leadingInt(value.slice(1));
  if (!ok || value.slice(1) === rem) return 0;
  if (x > 23) return 0;
  return value.length - rem.length;
}

function parseGMT(value: string): number {
  value = value.slice(3);
  if (value.length === 0) return 3;
  return 3 + parseSignedOffset(value);
}

/** Length of a time zone abbreviation at the start of value, or ok=false. */
function parseTimeZone(value: string): [length: number, ok: boolean] {
  if (value.length < 3) return [0, false];
  // ChST and MeST are the only zones with a lower-case letter.
  if (value.length >= 4 && (value.startsWith('ChST') || value.startsWith('MeST'))) return [4, true];
  // GMT may have an hour offset.
  if (value.startsWith('GMT')) return [parseGMT(value), true];
  // Some zones are not named but have a +/-00 form.
  if (value[0] === '+' || value[0] === '-') {
    const length = parseSignedOffset(value);
    return [length, length > 0];
  }
  let nUpper = 0;
  for (; nUpper < 6; nUpper++) {
    if (nUpper >= value.length) break;
    const c = value.charCodeAt(nUpper);
    if (c < 0x41 || c > 0x5a) break;
  }
  switch (nUpper) {
    case 5: // must end in T
      if (value[4] === 'T') return [5, true];
      break;
    case 4: // must end in T, except WITA
      if (value[3] === 'T' || value.startsWith('WITA')) return [4, true];
      break;
    case 3:
      return [3, true];
  }
  return [0, false];
}

/**
 * Parses value according to a Go reference-time layout, like time.Parse and
 * time.ParseInLocation. Throws ParseError with Go's message on failure.
 */
export function parse(layout: string, value: string, options: ParseOptions = {}): GoTime {
  const loc = options.location;
  return parseImpl(layout, value, loc ?? UTC, loc ?? UTC);
}

/** Like time.ParseInLocation. */
export function parseInLocation(layout: string, value: string, loc: Location): GoTime {
  return parseImpl(layout, value, loc, loc);
}

function parseImpl(layoutIn: string, valueIn: string, defaultLocation: Location, local: Location): GoTime {
  const alayout = toBytes(layoutIn);
  const avalue = toBytes(valueIn);
  let layout = alayout;
  let value = avalue;
  let rangeErrString = '';
  let amSet = false;
  let pmSet = false;

  let year = 0;
  let month = -1;
  let day = -1;
  let yday = -1;
  let hour = 0;
  let min = 0;
  let sec = 0;
  let nsec = 0;
  let z: Location | undefined;
  let zoneOffset = -1;
  let zoneName = '';

  const fail = (elem: string, valueElem: string, detail = ''): never => {
    throw newParseError(alayout, avalue, elem, valueElem, detail) as ParseError;
  };

  for (;;) {
    let bad = false;
    const [prefix, std, suffix] = L.nextStdChunk(layout);
    const stdstr = layout.slice(prefix.length, layout.length - suffix.length);
    const [rest, skipBad] = skip(value, prefix);
    value = rest;
    if (skipBad) fail(prefix, value);
    if (std === 0) {
      if (value.length !== 0) fail('', value, ': extra text: ' + quote(value));
      break;
    }
    layout = suffix;
    let p: string;
    const hold = value;
    switch (std & L.stdMask) {
      case L.stdYear: {
        if (value.length < 2) {
          bad = true;
          break;
        }
        p = value.slice(0, 2);
        value = value.slice(2);
        const [yy, yok] = atoi(p);
        year = yy;
        bad = !yok;
        if (bad) break;
        year += year >= 69 ? 1900 : 2000; // Unix time starts Dec 31 1969 in some zones
        break;
      }
      case L.stdLongYear: {
        if (value.length < 4 || !isDigitAt(value, 0)) {
          bad = true;
          break;
        }
        p = value.slice(0, 4);
        value = value.slice(4);
        const [y, ok] = atoi(p);
        year = y;
        bad = !ok;
        break;
      }
      case L.stdMonth:
        [month, value, bad] = lookup(shortMonthNames, value);
        month++;
        break;
      case L.stdLongMonth:
        [month, value, bad] = lookup(longMonthNames, value);
        month++;
        break;
      case L.stdNumMonth:
      case L.stdZeroMonth:
        [month, value, bad] = getnum(value, std === L.stdZeroMonth);
        if (!bad && (month <= 0 || 12 < month)) rangeErrString = 'month';
        break;
      case L.stdWeekDay:
        [, value, bad] = lookup(shortDayNames, value);
        break;
      case L.stdLongWeekDay:
        [, value, bad] = lookup(longDayNames, value);
        break;
      case L.stdDay:
      case L.stdUnderDay:
      case L.stdZeroDay:
        if (std === L.stdUnderDay && value.length > 0 && value[0] === ' ') value = value.slice(1);
        [day, value, bad] = getnum(value, std === L.stdZeroDay);
        // Any one- or two-digit day is accepted here; the date is validated at the end.
        break;
      case L.stdUnderYearDay:
      case L.stdZeroYearDay:
        for (let i = 0; i < 2; i++) {
          if (std === L.stdUnderYearDay && value.length > 0 && value[0] === ' ') value = value.slice(1);
        }
        [yday, value, bad] = getnum3(value, std === L.stdZeroYearDay);
        break;
      case L.stdHour:
        [hour, value, bad] = getnum(value, false);
        if (hour < 0 || 24 <= hour) rangeErrString = 'hour';
        break;
      case L.stdHour12:
      case L.stdZeroHour12:
        [hour, value, bad] = getnum(value, std === L.stdZeroHour12);
        if (hour < 0 || 12 < hour) rangeErrString = 'hour';
        break;
      case L.stdMinute:
      case L.stdZeroMinute:
        [min, value, bad] = getnum(value, std === L.stdZeroMinute);
        if (min < 0 || 60 <= min) rangeErrString = 'minute';
        break;
      case L.stdSecond:
      case L.stdZeroSecond: {
        [sec, value, bad] = getnum(value, std === L.stdZeroSecond);
        if (bad) break;
        if (sec < 0 || 60 <= sec) {
          rangeErrString = 'second';
          break;
        }
        // A fractional second in the input but none in the layout is still accepted.
        if (value.length >= 2 && commaOrPeriod(value[0]) && isDigitAt(value, 1)) {
          const next = L.nextStdChunk(layout)[1] & L.stdMask;
          if (next === L.stdFracSecond0 || next === L.stdFracSecond9) break; // handled by the layout
          let n = 2;
          while (n < value.length && isDigitAt(value, n)) n++;
          [nsec, rangeErrString, bad] = parseNanoseconds(value, n);
          value = value.slice(n);
        }
        break;
      }
      case L.stdPM:
        if (value.length < 2) {
          bad = true;
          break;
        }
        p = value.slice(0, 2);
        value = value.slice(2);
        if (p === 'PM') pmSet = true;
        else if (p === 'AM') amSet = true;
        else bad = true;
        break;
      case L.stdpm:
        if (value.length < 2) {
          bad = true;
          break;
        }
        p = value.slice(0, 2);
        value = value.slice(2);
        if (p === 'pm') pmSet = true;
        else if (p === 'am') amSet = true;
        else bad = true;
        break;
      case L.stdISO8601TZ:
      case L.stdISO8601ShortTZ:
      case L.stdISO8601ColonTZ:
      case L.stdISO8601SecondsTZ:
      case L.stdISO8601ColonSecondsTZ:
        if (value.length >= 1 && value[0] === 'Z') {
          value = value.slice(1);
          z = UTC;
          break;
        }
      // fallthrough
      case L.stdNumTZ:
      case L.stdNumShortTZ:
      case L.stdNumColonTZ:
      case L.stdNumSecondsTz:
      case L.stdNumColonSecondsTZ: {
        let sign: string, hh: string, mm: string, ss: string;
        if (std === L.stdISO8601ColonTZ || std === L.stdNumColonTZ) {
          if (value.length < 6) {
            bad = true;
            break;
          }
          if (value[3] !== ':') {
            bad = true;
            break;
          }
          [sign, hh, mm, ss, value] = [value.slice(0, 1), value.slice(1, 3), value.slice(4, 6), '00', value.slice(6)];
        } else if (std === L.stdNumShortTZ || std === L.stdISO8601ShortTZ) {
          if (value.length < 3) {
            bad = true;
            break;
          }
          [sign, hh, mm, ss, value] = [value.slice(0, 1), value.slice(1, 3), '00', '00', value.slice(3)];
        } else if (std === L.stdISO8601ColonSecondsTZ || std === L.stdNumColonSecondsTZ) {
          if (value.length < 9) {
            bad = true;
            break;
          }
          if (value[3] !== ':' || value[6] !== ':') {
            bad = true;
            break;
          }
          [sign, hh, mm, ss, value] = [value.slice(0, 1), value.slice(1, 3), value.slice(4, 6), value.slice(7, 9), value.slice(9)];
        } else if (std === L.stdISO8601SecondsTZ || std === L.stdNumSecondsTz) {
          if (value.length < 7) {
            bad = true;
            break;
          }
          [sign, hh, mm, ss, value] = [value.slice(0, 1), value.slice(1, 3), value.slice(3, 5), value.slice(5, 7), value.slice(7)];
        } else {
          if (value.length < 5) {
            bad = true;
            break;
          }
          [sign, hh, mm, ss, value] = [value.slice(0, 1), value.slice(1, 3), value.slice(3, 5), '00', value.slice(5)];
        }
        let hr = 0;
        let mi = 0;
        let se = 0;
        [hr, , bad] = getnum(hh, true);
        if (!bad) {
          [mi, , bad] = getnum(mm, true);
          if (!bad) [se, , bad] = getnum(ss, true);
        }
        // Range tests use > rather than >=: some people write offsets of 24 hours, 60 minutes or 60 seconds.
        if (hr > 24) rangeErrString = 'time zone offset hour';
        if (mi > 60) rangeErrString = 'time zone offset minute';
        if (se > 60) rangeErrString = 'time zone offset second';
        zoneOffset = (hr * 60 + mi) * 60 + se;
        if (sign === '+') {
          // positive
        } else if (sign === '-') {
          zoneOffset = -zoneOffset;
        } else {
          bad = true;
        }
        break;
      }
      case L.stdTZ: {
        if (value.length >= 3 && value.startsWith('UTC')) {
          z = UTC;
          value = value.slice(3);
          break;
        }
        const [n, ok] = parseTimeZone(value);
        if (!ok) {
          bad = true;
          break;
        }
        zoneName = value.slice(0, n);
        value = value.slice(n);
        break;
      }
      case L.stdFracSecond0: {
        // Requires exactly the number of digits in the layout.
        const ndigit = 1 + L.digitsLen(std);
        if (value.length < ndigit) {
          bad = true;
          break;
        }
        [nsec, rangeErrString, bad] = parseNanoseconds(value, ndigit);
        value = value.slice(ndigit);
        break;
      }
      case L.stdFracSecond9: {
        if (value.length < 2 || !commaOrPeriod(value[0]) || value[1]! < '0' || value[1]! > '9') break; // omitted
        // Take any number of digits, even more than asked for, as the seconds case would.
        let i = 0;
        while (i + 1 < value.length && value[i + 1]! >= '0' && value[i + 1]! <= '9') i++;
        [nsec, rangeErrString, bad] = parseNanoseconds(value, 1 + i);
        value = value.slice(1 + i);
        break;
      }
    }
    if (rangeErrString !== '') fail(stdstr, value, ': ' + rangeErrString + ' out of range');
    if (bad) fail(stdstr, hold);
  }

  if (pmSet && hour < 12) hour += 12;
  else if (amSet && hour === 12) hour = 0;

  // Convert yday to day, month.
  if (yday >= 0) {
    let d = 0;
    let m = 0;
    if (isLeap(year)) {
      if (yday === 31 + 29) {
        m = 2;
        d = 29;
      } else if (yday > 31 + 29) {
        yday--;
      }
    }
    if (yday < 1 || yday > 365) fail('', value, ': day-of-year out of range');
    if (m === 0) {
      m = Math.trunc((yday - 1) / 31) + 1;
      if (daysBefore(m + 1) < yday) m++;
      d = yday - daysBefore(m);
    }
    // If month, day already seen, yday's m, d must match.
    if (month >= 0 && month !== m) fail('', value, ': day-of-year does not match month');
    month = m;
    if (day >= 0 && day !== d) fail('', value, ': day-of-year does not match day');
    day = d;
  } else {
    if (month < 0) month = 1;
    if (day < 0) day = 1;
  }

  // Validate the day of the month.
  if (day < 1 || day > daysIn(month, year)) fail('', value, ': day out of range');

  if (z !== undefined) {
    const [u, n] = dateToUnix(year, month, day, hour, min, sec, nsec, z);
    return fromUnix(u, n, z);
  }

  if (zoneOffset !== -1) {
    const [u0, n] = dateToUnix(year, month, day, hour, min, sec, nsec, UTC);
    const u = u0 - zoneOffset;
    // If the local zone has this offset (and name) at that instant, use it.
    if (local.offsetAt(u) === zoneOffset && (zoneName === '' || local.nameAt(u) === zoneName)) {
      return fromUnix(u, n, local);
    }
    return fromUnix(u, n, fixedZone(fromBytes(zoneName), zoneOffset));
  }

  if (zoneName !== '') {
    const [u0, n] = dateToUnix(year, month, day, hour, min, sec, nsec, UTC);
    const name = fromBytes(zoneName);
    let offset = local.offsetForName(name, u0);
    if (offset !== undefined) return fromUnix(u0 - offset, n, local);
    // Otherwise a fabricated zone with an unknown offset: zero, or the hours of "GMT+5".
    offset = 0;
    if (zoneName.length > 3 && zoneName.startsWith('GMT')) offset = atoi(zoneName.slice(3))[0] * 3600;
    return fromUnix(u0, n, fixedZone(name, offset));
  }

  const [u, n] = dateToUnix(year, month, day, hour, min, sec, nsec, defaultLocation);
  return fromUnix(u, n, defaultLocation);
}
