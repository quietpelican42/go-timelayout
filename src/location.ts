// Time zones: UTC, fixed offsets, and IANA names resolved through Intl.

/**
 * A time zone. Implementations are read-only after construction.
 * `name` is the location name, not a zone abbreviation.
 */
export interface Location {
  readonly name: string;
  /** Offset in seconds east of UTC at the given Unix second. */
  offsetAt(unixSec: number): number;
  /** Zone abbreviation in effect at the given Unix second ("" when unnamed). */
  nameAt(unixSec: number): string;
  /** Offset for a zone abbreviation known to this location, or undefined (Go's lookupName). */
  offsetForName(zoneName: string, unixSec: number): number | undefined;
}

class UTCLocation implements Location {
  readonly name = 'UTC';
  offsetAt(): number {
    return 0;
  }
  nameAt(): string {
    return 'UTC';
  }
  offsetForName(): undefined {
    return undefined;
  }
}

class FixedLocation implements Location {
  readonly name: string;
  readonly offset: number;
  constructor(name: string, offset: number) {
    this.name = name;
    this.offset = offset;
  }
  offsetAt(): number {
    return this.offset;
  }
  nameAt(): string {
    return this.name;
  }
  offsetForName(zoneName: string): number | undefined {
    return zoneName === this.name ? this.offset : undefined;
  }
}

export const UTC: Location = new UTCLocation();

/** A location with one zone of the given name and offset (seconds east of UTC). */
export function fixedZone(name: string, offsetSeconds: number): Location {
  if (!Number.isInteger(offsetSeconds)) throw new RangeError('offsetSeconds must be an integer');
  return new FixedLocation(name, offsetSeconds);
}

const MAX_SEC = 8.64e12; // Date range, in seconds
const clampSec = (s: number): number => (s > MAX_SEC ? MAX_SEC : s < -MAX_SEC ? -MAX_SEC : s);

// Locales tried in order for a short zone name that is not a "GMT+1" style fallback.
const ABBR_LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-NZ', 'en-CA', 'en-IN', 'en-ZA', 'ja-JP'];

class IntlLocation implements Location {
  readonly name: string;
  private readonly fields: Intl.DateTimeFormat;
  private readonly abbr = new Map<string, Intl.DateTimeFormat>();
  private zones: Array<[string, number]> | undefined;
  private firstChange: number | undefined;
  private modern: Map<number, string> | undefined;
  private readonly nameCache = new Map<number, string>();
  private readonly override: LoadOptions['abbreviation'];

  constructor(name: string, options: LoadOptions = {}) {
    this.name = name;
    this.override = options.abbreviation;
    this.fields = new Intl.DateTimeFormat('en-US', {
      timeZone: name,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      era: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  }

  offsetAt(unixSec: number): number {
    const sec = clampSec(unixSec);
    const p: Record<string, string> = {};
    for (const part of this.fields.formatToParts(sec * 1000)) p[part.type] = part.value;
    let year = Number(p.year);
    if (p.era === 'BC') year = 1 - year;
    const d = new Date(0);
    d.setUTCFullYear(year, Number(p.month) - 1, Number(p.day));
    d.setUTCHours(Number(p.hour), Number(p.minute), Number(p.second), 0);
    return d.getTime() / 1000 - sec;
  }

  nameAt(unixSec: number): string {
    const sec = clampSec(unixSec);
    const cached = this.nameCache.get(sec);
    if (cached !== undefined) return cached;
    if (this.override) {
      const custom = this.override(sec, this.offsetAt(sec));
      if (custom !== undefined) return custom;
    }
    // Before the first recorded transition tzdata (and Go) use local mean time.
    if (sec < this.firstTransition() && this.name.includes('/') && !this.name.startsWith('Etc/')) return 'LMT';
    let result = '';
    for (const locale of ABBR_LOCALES) {
      const raw = this.shortName(locale, sec);
      if (raw !== undefined && !/^GMT[+\-−]/.test(raw)) {
        result = raw;
        break;
      }
    }
    if (result === '') {
      const offset = this.offsetAt(sec);
      // ICU has no short names before 1970 for many zones; borrow the name this offset has in 1970-2040.
      result = (sec < 0 ? this.modernNames().get(offset) : undefined) ?? numericName(offset);
    }
    if (this.nameCache.size > 4096) this.nameCache.clear();
    this.nameCache.set(sec, result);
    return result;
  }

  /** Alphabetic ICU short names seen in 1970-2040, by offset (first seen wins). */
  private modernNames(): Map<number, string> {
    if (this.modern) return this.modern;
    const map = new Map<number, string>();
    for (let s = 0; s < 2208988800; s += 30 * 86400) {
      const offset = this.offsetAt(s);
      if (map.has(offset)) continue;
      for (const locale of ABBR_LOCALES) {
        const raw = this.shortName(locale, s);
        if (raw !== undefined && !/^GMT[+\-\u2212]/.test(raw)) {
          map.set(offset, raw);
          break;
        }
      }
    }
    this.modern = map;
    return map;
  }

  /** Unix second of the first offset change after year 0 (yearly scan, then bisection). */
  private firstTransition(): number {
    if (this.firstChange !== undefined) return this.firstChange;
    const start = -62167219200;
    const base = this.offsetAt(start);
    let lo = start;
    let found = Number.NEGATIVE_INFINITY;
    for (let s = start + 31556952; s < 253402300799; s += 31556952) {
      if (this.offsetAt(s) !== base) {
        let hi = s;
        while (hi - lo > 1) {
          const mid = Math.floor((lo + hi) / 2);
          if (this.offsetAt(mid) === base) lo = mid;
          else hi = mid;
        }
        found = hi;
        break;
      }
      lo = s;
    }
    this.firstChange = found;
    return found;
  }

  private shortName(locale: string, sec: number): string | undefined {
    let f = this.abbr.get(locale);
    if (f === undefined) {
      f = new Intl.DateTimeFormat(locale, { timeZone: this.name, timeZoneName: 'short' });
      this.abbr.set(locale, f);
    }
    for (const part of f.formatToParts(sec * 1000)) {
      if (part.type === 'timeZoneName') return part.value;
    }
    return undefined;
  }

  offsetForName(zoneName: string, unixSec: number): number | undefined {
    const zones = this.zoneList();
    // Prefer a zone with this name that was in effect at the time.
    for (const [name, offset] of zones) {
      if (name === zoneName && this.nameAt(unixSec - offset) === name) {
        return this.offsetAt(unixSec - offset);
      }
    }
    for (const [name, offset] of zones) {
      if (name === zoneName) return offset;
    }
    return undefined;
  }

  /** Distinct (abbreviation, offset) pairs: yearly samples 0000..1900, fortnightly 1900..2100. */
  private zoneList(): Array<[string, number]> {
    if (this.zones) return this.zones;
    const seen = new Set<string>();
    const list: Array<[string, number]> = [];
    const y1900 = Date.UTC(1900, 0, 1) / 1000;
    const end = Date.UTC(2100, 0, 1) / 1000;
    let prev = Number.NaN;
    for (let s = -62167219200; s < end; s += s < y1900 ? 365 * 86400 : 14 * 86400) {
      const off = this.offsetAt(s);
      if (off === prev) continue;
      prev = off;
      const name = this.nameAt(s);
      const key = `${name}\0${off}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push([name, off]);
      }
    }
    this.zones = list;
    return list;
  }
}

/** tzdata style name for a zone with no alphabetic abbreviation: "+04", "+0530". */
function numericName(offset: number): string {
  const sign = offset < 0 ? '-' : '+';
  const a = Math.abs(offset);
  const h = String(Math.floor(a / 3600)).padStart(2, '0');
  const m = Math.floor((a % 3600) / 60);
  const s = a % 60;
  if (s !== 0) return `${sign}${h}${String(m).padStart(2, '0')}${String(s).padStart(2, '0')}`;
  return m !== 0 ? `${sign}${h}${String(m).padStart(2, '0')}` : `${sign}${h}`;
}

const cache = new Map<string, Location>();

export interface LoadOptions {
  /**
   * Supplies zone abbreviations (Go's "MST" element) in place of the ICU-derived ones.
   * Return undefined to fall back to ICU for that instant.
   */
  abbreviation?: (unixSec: number, offsetSeconds: number) => string | undefined;
}

/**
 * Loads an IANA zone by name, using the runtime's Intl database.
 * "" and "UTC" return UTC. Throws for an unknown name.
 */
export function loadLocation(name: string, options?: LoadOptions): Location {
  if (name === '' || name === 'UTC') return UTC;
  const hit = options ? undefined : cache.get(name);
  if (hit) return hit;
  if (name === 'Local') throw new Error('unknown time zone Local: the system zone is not supported');
  let loc: IntlLocation;
  try {
    loc = new IntlLocation(name, options);
  } catch {
    throw new Error('unknown time zone ' + name);
  }
  if (!options) cache.set(name, loc);
  return loc;
}
