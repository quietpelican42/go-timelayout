# go-timelayout

Go's `time.Time.Format`, `time.Parse` and `time.ParseInLocation` reference-time layouts for Node and TypeScript, with nanosecond precision and Go's error messages.

```ts
import { format, parse, unix, fixedZone, RFC3339Nano } from 'go-timelayout';

const t = parse(RFC3339Nano, '2023-11-14T22:13:20.123456789+05:30');
t.epochNanos;                            // 1699980200123456789n
format(t, 'Jan _2 15:04:05.000');        // "Nov 14 22:13:20.123"
format(unix(0, 0, fixedZone('', -18000)), 'Mon Jan _2 15:04:05 MST 2006');
// "Wed Dec 31 19:00:00 -0500 1969"
```

## Why

Go layouts show the reference time (`Mon Jan 2 15:04:05 MST 2006`) as it should look, instead of using format codes. Services written in Go emit these layouts in logs, APIs and config files. Reading or writing them from Node needs the same rules for padding, fractional seconds, zone abbreviations and range checks. A JS `Date` also stops at milliseconds, while `.000000000` and `.999999999` layouts carry nanoseconds.

The existing packages diverge from Go on common layouts. Examples from the corpus: `RFC3339` output gains a fractional part, `,000` and `.9` are wrong, `Jan _2 06 3:4:5 PM` drops minutes and seconds, and a zone with no name prints nothing for `MST` where Go prints the numeric offset.

Measured: `node bench/incumbents.ts`, which compares each implementation with real Go 1.27.1 output on the predefined-layout grid (39 layouts, 9 instants, 5 offsets).

```
implementation                 Format               Parse round trip (Go-accepted)
go-timelayout                  1755/1755 = 100.0%   1539/1539 = 100.0%
@ahxar/go-time 1.1.6           1270/1755 = 72.4%    571/1539 = 37.1%
locutus 3.0.36 golang/time     116/351 = 33.0%      69/351 = 19.7%
```

The locutus rows use the UTC subset because it formats JS `Date` objects only. A third package, goscript `gs/time`, was measured with a separate esbuild harness on a slightly different corpus (1,665 Format and 1,449 Parse cases): 75.0% Format and 31.1% Parse. That harness is not part of this repository. Excluding layouts that contain `MST`, where goscript prints an empty name for an unnamed zone, its Format score is 85.7%.

## Installation

```sh
npm install go-timelayout
```

Node 20.6 or later. No runtime dependencies.

## Usage

### Format

```ts
import { format, date, UTC, Layout, UnixDate, Kitchen } from 'go-timelayout';

const t = date(2009, 11, 10, 23, 0, 0, 0, UTC);
format(t, Layout);      // "11/10 11:00:00PM '09 +0000"
format(t, UnixDate);    // "Tue Nov 10 23:00:00 UTC 2009"
format(t, Kitchen);     // "11:00PM"
format(new Date(0), 'Z07:00');   // "Z"  (a JS Date is formatted in UTC)
```

### Parse

```ts
import { parse, parseInLocation, loadLocation, DateTime } from 'go-timelayout';

parse(DateTime, '2020-05-06 07:08:09');                 // UTC, like Go's Parse
parseInLocation(DateTime, '2020-05-06 07:08:09', loadLocation('Europe/Paris'));
parse(DateTime, '2020-05-06 07:08:09', { location: loadLocation('Europe/Paris') }); // same

try {
  parse('2006-01-02', '2023-02-30');
} catch (e) {
  e.message;   // 'parsing time "2023-02-30": day out of range'
}
```

Errors are `ParseError` instances. `message` is Go's `ParseError.Error()` text, byte for byte, including `\x..` escapes for non-ASCII input.

### Zones

```ts
import { fixedZone, loadLocation, unix, format, RFC1123 } from 'go-timelayout';

format(unix(1700000000, 0, loadLocation('America/New_York')), RFC1123);
// "Tue, 14 Nov 2023 17:13:20 EST"
format(unix(0, 0, fixedZone('', 19800)), 'MST');   // "+0530"  (unnamed zone: numeric offset)
```

## Reference

### Functions

| Name | Description |
| --- | --- |
| `format(t, layout)` | Like `Time.Format`. `t` is a `GoTime` or a JS `Date` (UTC). |
| `parse(layout, value, options?)` | Like `time.Parse`, or `ParseInLocation` when `options.location` is set. Returns a `GoTime`. Throws `ParseError`. |
| `parseInLocation(layout, value, loc)` | Like `time.ParseInLocation`. |
| `unix(sec, nsec?, loc?)` | Like `time.Unix(sec, nsec).In(loc)`. |
| `date(year, month, day, hour?, min?, sec?, nsec?, loc?)` | Like `time.Date`. Month is 1 to 12. Out-of-range fields normalize as in Go. |
| `inLocation(epochNanos, loc?)` | An instant shown in a location. |
| `fromDate(date, loc?)`, `toDate(t)` | Convert to and from a JS `Date` (milliseconds, floored). |
| `civil(t)` | Calendar fields of `t` in its own zone. |
| `fixedZone(name, offsetSeconds)` | A location with one zone, like `time.FixedZone`. |
| `loadLocation(name, options?)` | An IANA zone through `Intl`. `""` and `"UTC"` return `UTC`. Throws `unknown time zone X`. |
| `UTC` | The UTC location. Its zone name is `UTC`. |

### GoTime

| Field | Type | Description |
| --- | --- | --- |
| `epochNanos` | `bigint` | Nanoseconds since the Unix epoch. |
| `offsetSeconds` | `number` | Seconds east of UTC. |
| `zoneName` | `string` | Zone abbreviation. Empty for an unnamed zone. |

A `GoTime` is a snapshot. It records the offset and abbreviation in effect at the instant, and any object with these three fields works with `format`.

### ParseError

| Field | Description |
| --- | --- |
| `message` | Go's `Error()` string. |
| `layout`, `value` | The arguments. |
| `layoutElem`, `valueElem` | The element and input text that failed. |
| `detail` | Go's `Message`: the text after the quoted value, or `""`. |

### Options

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `parse` `options.location` | `Location` | UTC | Location for input without zone information, and the location searched for offsets and abbreviations. |
| `loadLocation` `options.abbreviation` | `(unixSec, offsetSeconds) => string \| undefined` | ICU names | Supplies zone abbreviations. Return `undefined` to use the ICU name. |

### Layout constants

`Layout`, `ANSIC`, `UnixDate`, `RubyDate`, `RFC822`, `RFC822Z`, `RFC850`, `RFC1123`, `RFC1123Z`, `RFC3339`, `RFC3339Nano`, `Kitchen`, `Stamp`, `StampMilli`, `StampMicro`, `StampNano`, `DateTime`, `DateOnly`, `TimeOnly`.

### Layout elements

Every element in Go's `format.go` is supported.

| Element | Layout text |
| --- | --- |
| Year | `2006` `06` |
| Month | `Jan` `January` `01` `1` |
| Weekday | `Mon` `Monday` |
| Day | `2` `_2` `02`; day of year `__2` `002` |
| Hour | `15` `3` `03`; `PM` `pm` |
| Minute, second | `4` `04` `5` `05` |
| Fraction | `.000` `.999` `,000` `,999` with any digit count |
| Zone name | `MST` |
| Zone offset | `-0700` `-07:00` `-07` `-070000` `-07:00:00` and the `Z` forms of each |

## How it works

`src/layout.ts`, `src/format.ts` and `src/parse.ts` are a close port of Go's `time/format.go`, including the tokenizer (`nextStdChunk`) and the order in which parse checks happen. Layouts and values are converted to UTF-8 byte strings before processing, because Go indexes strings by byte. That keeps error messages identical for non-ASCII input.

Instants are `bigint` nanoseconds. Calendar arithmetic uses whole seconds as JS numbers, so years within about plus or minus 285 million are supported.

Zone handling follows Go's `Date` and `Parse` rules:

- A zone offset with no name creates a fixed zone with an empty name, so `MST` prints the numeric offset.
- `UTC` and `Z` always parse to UTC.
- An unknown abbreviation is accepted and recorded as a fabricated zone with offset 0, so the instant is read as UTC. `GMT+5` style names record the offset without moving the instant.
- A known offset or abbreviation in the given location resolves to that location.

IANA zones are resolved through `Intl.DateTimeFormat`. Offsets come from the fields of the formatted instant. Abbreviations come from the short zone name, tried across several English locales, then from the numeric form (`+04`, `+0530`) that tzdata uses for unnamed zones. Before a zone's first transition the name is `LMT`. Before 1970, where ICU has no short names for many zones, the name this offset has in 1970 to 2040 is used.

## Limitations

- IANA zone abbreviations come from ICU, not tzdata. Offsets match Go; abbreviations do not always. See the table below.
- `Local` is not supported. Pass a location explicitly. `parse` without a location treats the local zone as UTC.
- `loadLocation` accepts any name `Intl` accepts, including different letter case, which Go rejects.
- Parsing a zone abbreviation in an IANA location only knows the abbreviations that ICU reports for that zone between 0000 and 2100. Abbreviations ICU cannot name (for example `MSK` in `Europe/Moscow`) are treated as unknown and fabricated with offset 0.
- Go's zone tables contain historical abbreviations (`EWT`, `AHST`) that ICU does not report. Use the `abbreviation` option to supply exact names.
- There is no monotonic clock, `Duration`, `Add`, `Truncate`, `Round` or `Time.String`.
- Go's fast paths for `RFC3339` are not ported. The general code gives the same results in every case tested.

### IANA agreement with Go

Measured by `node bench/iana.ts --per 300`: 22 zones, 300 random instants per zone and era, checked separately for the offset (`-07:00:00`) and the abbreviation (`MST`) against Go 1.27.1 using the tzdata 2026c bundled with Go. Node 24.20.0 reports tzdata 2026c through ICU 78.3.

```
offset (26,400 checks)          100.00%   in every era
abbreviation, all eras          86.16%
  1970-2040                     85.38%
  1900-1970                     73.35%
  0000-1900                     99.56%
  2040-9999                     86.36%
```

Abbreviations by zone, all eras: `Sao_Paulo`, `Sydney`, `Cairo`, `Kathmandu` 100%; `New_York`, `Chicago`, `Los_Angeles`, `Berlin`, `Tokyo`, `Singapore`, `Johannesburg`, `London` 98% to 99.8%; `Kolkata` 96.7%; `Auckland` 87.3%; `Paris` 85.3%; `Honolulu` 82.3%; `Anchorage` 69.6%; `Dubai` 33.0% (ICU says `GST`, tzdata says `+04`); `Moscow` 27.8% and `Shanghai` 25.3% (ICU has no `MSK` or `CST`, so the numeric form is printed).

The differential generator in IANA mode (`node oracle/run.ts --n 20000 --seed 11 --iana`) gives, for layouts that always include a zone element: Format 93.3%, and Parse 99.7% with 24 of 10,242 accepted parses landing on a different instant or offset (all abbreviation lookups). Two runs (seeds 11 and 12) gave 93.3% and 93.0% Format, 99.7% Parse.

## Verification

Every claim of exactness rests on real Go output. `oracle/main.go` runs Format and Parse cases through the Go standard library. `oracle/run.ts` generates random layouts and instants, runs both, and compares.

```sh
node oracle/run.ts --n 50000 --seed 1     # 50,000 Format + 50,000 Parse cases
```

| Run | Cases | Format | Parse (message text and result) |
| --- | --- | --- | --- |
| seed 1 | 100,000 | 50,000 / 50,000 | 50,000 / 50,000 |
| seed 2 | 100,000 | 50,000 / 50,000 | 50,000 / 50,000 |
| seed 3 | 100,000 | 50,000 / 50,000 | 50,000 / 50,000 |
| seed 777 (fuzz) | 300,000 | 150,000 / 150,000 | 150,000 / 150,000 |

Each Parse run compares about half accepted and half rejected inputs (rejections include the exact error message). Layouts mix elements and literals, including `_2006`, `Janx`, `.0000000000`, and non-ASCII text. Instants cover years 0 to 9999, some outside it, and pre-1970 values. Zones are UTC and fixed offsets with random names, including offsets with seconds and beyond 24 hours. Parse values are Go's own output, mutated in half the cases (out-of-range digits, edited or dropped characters, appended fractions, random strings).

A property fuzz (`test/fuzz.test.ts`) runs without Go: 20,000 random layouts must never make `format` throw or `parse` throw anything but `ParseError`, and a lossless layout must round-trip.

The committed fixture `test/fixtures/oracle.json.gz` holds 6,510 cases with Go's answers (the predefined-layout grid plus a random sample) and runs in `npm test` without Go. `node oracle/fixture.ts` regenerates it.

## Compatibility

Run: Node 24.20.0 on macOS arm64 (test suite, oracle runs, build output), Go 1.27.1 for the oracle. The compiled `dist/` targets Node 20.6 and later. CI runs the dist smoke test on 20.6, 22 and 24, which has not been run here.

## Development

```sh
npm install
npx tsc --noEmit
npm test                # TypeScript suite, includes the Go fixture
npm run build && npm run test:dist
npm run verify -- --n 50000 --seed 1     # needs `go` on PATH
node bench/iana.ts                       # needs `go` on PATH
```

## License

MIT, see [LICENSE](LICENSE). The tokenizer, format and parse code is adapted from Go's `time/format.go`, Copyright The Go Authors, under a BSD-style license reproduced in [LICENSE-go](LICENSE-go).
