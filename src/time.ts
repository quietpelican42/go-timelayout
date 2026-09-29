import { civilFromDays, daysFromCivil, norm, secondsPerDay } from './civil.ts';
import { UTC, type Location } from './location.ts';

/**
 * A point in time as Go's time.Time presents it: an instant plus the zone it
 * is displayed in. `zoneName` is the abbreviation ("" when the zone is unnamed).
 */
export interface GoTime {
  /** Nanoseconds since the Unix epoch. */
  epochNanos: bigint;
  /** Seconds east of UTC. */
  offsetSeconds: number;
  zoneName: string;
}

const BILLION = 1_000_000_000n;

/** Splits epochNanos into whole seconds (floored) and a 0..999999999 remainder. */
export function splitNanos(epochNanos: bigint): [sec: number, nsec: number] {
  let sec = epochNanos / BILLION;
  let nsec = epochNanos % BILLION;
  if (nsec < 0n) {
    nsec += BILLION;
    sec -= 1n;
  }
  const s = Number(sec);
  if (!Number.isSafeInteger(s)) throw new RangeError('epochNanos is outside the supported range');
  return [s, Number(nsec)];
}

export function fromUnix(unixSec: number, nsec: number, loc: Location): GoTime {
  return {
    epochNanos: BigInt(unixSec) * BILLION + BigInt(nsec),
    offsetSeconds: loc.offsetAt(unixSec),
    zoneName: loc.nameAt(unixSec),
  };
}

/** The instant epochNanos displayed in loc (UTC by default). */
export function inLocation(epochNanos: bigint, loc: Location = UTC): GoTime {
  const [sec] = splitNanos(epochNanos);
  return { epochNanos, offsetSeconds: loc.offsetAt(sec), zoneName: loc.nameAt(sec) };
}

/** Like time.Unix(sec, nsec).In(loc). */
export function unix(sec: number | bigint, nsec: number | bigint = 0, loc: Location = UTC): GoTime {
  return inLocation(BigInt(sec) * BILLION + BigInt(nsec), loc);
}

/** A JS Date (millisecond precision) displayed in loc. */
export function fromDate(d: Date, loc: Location = UTC): GoTime {
  const ms = d.getTime();
  if (Number.isNaN(ms)) throw new RangeError('invalid Date');
  return inLocation(BigInt(ms) * 1_000_000n, loc);
}

/** The instant as a JS Date, truncated to milliseconds toward negative infinity. */
export function toDate(t: GoTime): Date {
  const ms = t.epochNanos / 1_000_000n - (t.epochNanos % 1_000_000n < 0n ? 1n : 0n);
  return new Date(Number(ms));
}

/**
 * Unix seconds for a civil date-time read in loc, with Go's Date() semantics:
 * out-of-range fields are normalized, and at a zone transition the offset
 * before the transition is used for skipped times.
 */
export function dateToUnix(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  sec: number,
  nsec: number,
  loc: Location,
): [unixSec: number, nsec: number] {
  let m = month - 1;
  [year, m] = norm(year, m, 12);
  month = m + 1;
  [sec, nsec] = norm(sec, nsec, 1_000_000_000);
  [min, sec] = norm(min, sec, 60);
  [hour, min] = norm(hour, min, 60);
  [day, hour] = norm(day, hour, 24);
  let unixSec = daysFromCivil(year, month, 1) * secondsPerDay + (day - 1) * secondsPerDay + hour * 3600 + min * 60 + sec;
  let offset = loc.offsetAt(unixSec);
  if (offset !== 0) {
    // Equivalent to Go's start/end test: re-look-up at the candidate UTC time.
    offset = loc.offsetAt(unixSec - offset);
    unixSec -= offset;
  }
  return [unixSec, nsec];
}

/** Like time.Date(year, month, day, hour, min, sec, nsec, loc). Month is 1..12. */
export function date(
  year: number,
  month: number,
  day: number,
  hour = 0,
  min = 0,
  sec = 0,
  nsec = 0,
  loc: Location = UTC,
): GoTime {
  const [u, n] = dateToUnix(year, month, day, hour, min, sec, nsec, loc);
  return fromUnix(u, n, loc);
}

export interface Civil {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  nanosecond: number;
  /** 0 = Sunday. */
  weekday: number;
  /** 1-based day of year. */
  yearDay: number;
}

/** Calendar fields of t in its own zone. */
export function civil(t: GoTime): Civil {
  const [sec, nsec] = splitNanos(t.epochNanos);
  const abs = sec + t.offsetSeconds;
  const days = Math.floor(abs / secondsPerDay);
  const rem = abs - days * secondsPerDay;
  const [year, month, day] = civilFromDays(days);
  return {
    year,
    month,
    day,
    hour: Math.floor(rem / 3600),
    minute: Math.floor((rem % 3600) / 60),
    second: rem % 60,
    nanosecond: nsec,
    weekday: (((days + 4) % 7) + 7) % 7,
    yearDay: days - daysFromCivil(year, 1, 1) + 1,
  };
}

