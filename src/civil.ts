// Proleptic Gregorian calendar arithmetic on whole seconds.

export const secondsPerDay = 86400;

export function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Days in a non-leap year before month m (1..13). daysBefore(13) is 365. */
export function daysBefore(m: number): number {
  const adj = m >= 3 ? -2 : 0;
  return Math.trunc((214 * m - 211) / 7) + adj;
}

export function daysIn(m: number, year: number): number {
  if (m === 2) return isLeap(year) ? 29 : 28;
  return 30 + ((m + (m >> 3)) & 1);
}

/** Days since 1970-01-01 of a civil date. Month is 1..12. */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(days: number): [year: number, month: number, day: number] {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [m <= 2 ? y + 1 : y, m, d];
}

/** 1-based day of year. */
export function yearDay(days: number, year: number): number {
  return days - daysFromCivil(year, 1, 1) + 1;
}

/** 0 = Sunday. */
export function weekday(days: number): number {
  return (((days + 4) % 7) + 7) % 7;
}

/** Go's norm(): carries lo into hi so that 0 <= lo < base. */
export function norm(hi: number, lo: number, base: number): [number, number] {
  if (lo < 0) {
    const n = Math.trunc((-lo - 1) / base) + 1;
    hi -= n;
    lo += n * base;
  }
  if (lo >= base) {
    const n = Math.trunc(lo / base);
    hi += n;
    lo -= n * base;
  }
  return [hi, lo];
}
