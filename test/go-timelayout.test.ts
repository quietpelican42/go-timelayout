import assert from 'node:assert/strict';
import test from 'node:test';
import * as g from '../src/index.ts';

const ref = g.date(2009, 11, 10, 23, 0, 0, 0, g.UTC);

test('predefined layouts on the Go playground reference time', () => {
  assert.equal(g.format(ref, g.Layout), "11/10 11:00:00PM '09 +0000");
  assert.equal(g.format(ref, g.ANSIC), 'Tue Nov 10 23:00:00 2009');
  assert.equal(g.format(ref, g.UnixDate), 'Tue Nov 10 23:00:00 UTC 2009');
  assert.equal(g.format(ref, g.RubyDate), 'Tue Nov 10 23:00:00 +0000 2009');
  assert.equal(g.format(ref, g.RFC822), '10 Nov 09 23:00 UTC');
  assert.equal(g.format(ref, g.RFC850), 'Tuesday, 10-Nov-09 23:00:00 UTC');
  assert.equal(g.format(ref, g.RFC1123), 'Tue, 10 Nov 2009 23:00:00 UTC');
  assert.equal(g.format(ref, g.RFC1123Z), 'Tue, 10 Nov 2009 23:00:00 +0000');
  assert.equal(g.format(ref, g.RFC3339), '2009-11-10T23:00:00Z');
  assert.equal(g.format(ref, g.Kitchen), '11:00PM');
  assert.equal(g.format(ref, g.Stamp), 'Nov 10 23:00:00');
  assert.equal(g.format(ref, g.StampMilli), 'Nov 10 23:00:00.000');
  assert.equal(g.format(ref, g.StampNano), 'Nov 10 23:00:00.000000000');
  assert.equal(g.format(ref, g.DateTime), '2009-11-10 23:00:00');
  assert.equal(g.format(ref, g.DateOnly), '2009-11-10');
  assert.equal(g.format(ref, g.TimeOnly), '23:00:00');
});

test('fractional seconds: zeros keep, nines trim, comma separator', () => {
  const t = g.unix(1136239445, 120_000_000);
  assert.equal(g.format(t, '05.000'), '05.120');
  assert.equal(g.format(t, '05.999'), '05.12');
  assert.equal(g.format(t, '05,000000'), '05,120000');
  assert.equal(g.format(g.unix(0), '05.999'), '00');
  assert.equal(g.format(g.unix(0, 5), g.RFC3339Nano), '1970-01-01T00:00:00.000000005Z');
});

test('nanoseconds survive beyond millisecond precision', () => {
  const t = g.parse(g.RFC3339Nano, '2023-11-14T22:13:20.123456789Z');
  assert.equal(t.epochNanos, 1700000000123456789n);
  assert.equal(g.format(t, g.RFC3339Nano), '2023-11-14T22:13:20.123456789Z');
});

test('numeric and Z zone forms', () => {
  const z = g.fixedZone('', 5 * 3600 + 30 * 60 + 15);
  const t = g.unix(0, 0, z);
  assert.equal(g.format(t, '-0700 -07:00 -07 -070000 -07:00:00'), '+0530 +05:30 +05 +053015 +05:30:15');
  assert.equal(g.format(g.unix(0), 'Z0700 Z07:00 Z07 Z070000 Z07:00:00'), 'Z Z Z Z Z');
  assert.equal(g.format(g.unix(0, 0, g.fixedZone('', -3600)), 'Z07:00'), '-01:00');
});

test('MST prints the numeric offset when the zone has no name', () => {
  assert.equal(g.format(g.unix(0, 0, g.fixedZone('', -18000)), 'MST'), '-0500');
  assert.equal(g.format(g.unix(0, 0, g.fixedZone('', 0)), 'MST'), '+0000');
  assert.equal(g.format(g.unix(0, 0, g.fixedZone('EST', -18000)), 'MST'), 'EST');
  assert.equal(g.format(g.unix(0), 'MST'), 'UTC');
});

test('padding elements', () => {
  const t = g.date(2024, 3, 5, 4, 6, 7);
  assert.equal(g.format(t, '1 01 2 02 _2 __2 002'), '3 03 5 05  5  65 065');
  assert.equal(g.format(t, '3 03 4 04 5 05 15'), '4 04 6 06 7 07 04');
  assert.equal(g.format(g.date(2024, 3, 5, 0, 0), '3 03 PM pm'), '12 12 AM am');
  assert.equal(g.format(g.date(2024, 3, 5, 12, 0), '3 PM'), '12 PM');
  assert.equal(g.format(g.date(7, 1, 1), '2006 06'), '0007 07');
  assert.equal(g.format(g.date(-1, 1, 1), '2006 06'), '-0001 01');
});

test('unrecognized text is echoed; "Month" is not "Mon" + "th"', () => {
  assert.equal(g.format(ref, 'Month Monday Mond Janx _2006'), 'Month Tuesday Mond Janx _2009');
  assert.equal(g.format(ref, ''), '');
});

test('format accepts a JS Date as UTC', () => {
  assert.equal(g.format(new Date(Date.UTC(2020, 1, 29, 12, 30)), g.RFC3339), '2020-02-29T12:30:00Z');
});

test('parse: two-digit years use the 69 cutoff', () => {
  assert.equal(g.format(g.parse('06-01-02', '68-03-04'), g.DateOnly), '2068-03-04');
  assert.equal(g.format(g.parse('06-01-02', '69-03-04'), g.DateOnly), '1969-03-04');
});

test('parse: omitted elements default to zero or one, year 0', () => {
  const t = g.parse('3:04pm', '3:04pm');
  assert.equal(g.format(t, g.RFC3339), '0000-01-01T15:04:00Z');
});

test('parse: 12-hour clock with AM/PM', () => {
  assert.equal(g.format(g.parse('3:04PM', '12:30AM'), g.TimeOnly), '00:30:00');
  assert.equal(g.format(g.parse('3:04PM', '12:30PM'), g.TimeOnly), '12:30:00');
  assert.equal(g.format(g.parse('03:04pm', '11:59pm'), g.TimeOnly), '23:59:00');
});

test('parse: a fractional second is accepted even when the layout has none', () => {
  const t = g.parse('2006-01-02 15:04:05', '2020-01-02 03:04:05.987654321');
  assert.equal(t.epochNanos % 1_000_000_000n, 987654321n);
  const c = g.parse('2006-01-02 15:04:05', '2020-01-02 03:04:05,5');
  assert.equal(c.epochNanos % 1_000_000_000n, 500_000_000n);
  assert.throws(() => g.parse('2006-01-02 15:04:05.000', '2020-01-02 03:04:05.12'), g.ParseError);
});

test('parse: Go error messages', () => {
  const msg = (l: string, v: string): string => {
    try {
      g.parse(l, v);
    } catch (e) {
      return (e as Error).message;
    }
    return 'no error';
  };
  assert.equal(msg('2006-01-02', '2023-13-01'), 'parsing time "2023-13-01": month out of range');
  assert.equal(msg('2006-01-02', '2023-02-30'), 'parsing time "2023-02-30": day out of range');
  assert.equal(msg('2006-01-02', 'abc'), 'parsing time "abc" as "2006-01-02": cannot parse "abc" as "2006"');
  assert.equal(msg('2006-01-02', '2023-01-02x'), 'parsing time "2023-01-02x": extra text: "x"');
  assert.equal(msg('15:04', '24:00'), 'parsing time "24:00": hour out of range');
  assert.equal(msg('15:04:05', '10:00:60'), 'parsing time "10:00:60": second out of range');
  assert.equal(msg('2006-002', '2023-366'), 'parsing time "2023-366": day-of-year out of range');
  assert.equal(msg('2006-002', '2024-366'), 'no error');
  assert.equal(msg('2006-01-02', '2023-01-02é'), 'parsing time "2023-01-02\\xc3\\xa9": extra text: "\\xc3\\xa9"');
});

test('ParseError carries Go\'s fields', () => {
  try {
    g.parse('2006-01-02', 'abc');
    assert.fail('expected a throw');
  } catch (e) {
    assert.ok(e instanceof g.ParseError);
    assert.equal(e.layout, '2006-01-02');
    assert.equal(e.value, 'abc');
    assert.equal(e.layoutElem, '2006');
    assert.equal(e.valueElem, 'abc');
    assert.equal(e.detail, '');
  }
});

test('parse: an unknown zone abbreviation is fabricated with offset 0', () => {
  const t = g.parse(g.RFC1123, 'Mon, 02 Jan 2006 15:04:05 XYZ');
  assert.equal(t.zoneName, 'XYZ');
  assert.equal(t.offsetSeconds, 0);
  assert.equal(g.format(t, g.RFC3339), '2006-01-02T15:04:05Z');
  assert.equal(g.format(t, 'MST'), 'XYZ');
});

test('parse: GMT+N abbreviations record the offset without moving the instant', () => {
  const t = g.parse('Jan 2 15:04 MST 2006', 'Jan 2 10:00 GMT+5 2006');
  assert.equal(t.offsetSeconds, 18000);
  assert.equal(g.format(t, '15:04 MST'), '15:00 GMT+5');
  assert.equal(t.epochNanos, g.date(2006, 1, 2, 10, 0).epochNanos);
});

test('parse: "UTC" and "Z" are UTC in any location', () => {
  const est = g.fixedZone('EST', -5 * 3600);
  assert.equal(g.parseInLocation(g.RFC3339, '2020-05-06T07:08:09Z', est).zoneName, 'UTC');
  assert.equal(g.parseInLocation('2006-01-02 15:04 MST', '2020-05-06 07:08 UTC', est).offsetSeconds, 0);
});

test('parseInLocation: no zone in the input means the given location', () => {
  const est = g.fixedZone('EST', -5 * 3600);
  const t = g.parseInLocation(g.DateTime, '2020-05-06 07:08:09', est);
  assert.equal(t.epochNanos, g.date(2020, 5, 6, 12, 8, 9).epochNanos);
  assert.equal(t.zoneName, 'EST');
  assert.equal(g.parse(g.DateTime, '2020-05-06 07:08:09', { location: est }).epochNanos, t.epochNanos);
});

test('parseInLocation: an abbreviation known to the location resolves to its offset', () => {
  const est = g.fixedZone('EST', -5 * 3600);
  const t = g.parseInLocation('2006-01-02 15:04 MST', '2020-05-06 07:08 EST', est);
  assert.equal(t.offsetSeconds, -18000);
  assert.equal(t.epochNanos, g.date(2020, 5, 6, 12, 8).epochNanos);
});

test('parse: numeric offsets, with a range check like Go', () => {
  const t = g.parse(g.RFC3339, '2020-05-06T07:08:09+05:30');
  assert.equal(t.offsetSeconds, 19800);
  assert.equal(t.zoneName, '');
  assert.equal(t.epochNanos, g.date(2020, 5, 6, 1, 38, 9).epochNanos);
  assert.throws(() => g.parse(g.RFC3339, '2020-05-06T07:08:09+25:00'), /time zone offset hour out of range/);
});

test('IANA zones through Intl', () => {
  const ny = g.loadLocation('America/New_York');
  assert.equal(g.format(g.unix(1700000000, 0, ny), g.RFC1123), 'Tue, 14 Nov 2023 17:13:20 EST');
  assert.equal(g.format(g.unix(1690000000, 0, ny), g.RFC3339), '2023-07-22T00:26:40-04:00');
  const t = g.parseInLocation('2006-01-02 15:04 MST', '2023-07-04 12:00 EDT', ny);
  assert.equal(t.offsetSeconds, -14400);
  assert.equal(t.epochNanos, g.date(2023, 7, 4, 16, 0).epochNanos);
  // A wall time inside a spring-forward gap resolves the way Go's Date does (checked against Go).
  const gap = g.parseInLocation(g.DateTime, '2023-03-12 02:30:00', ny);
  assert.equal(g.format(gap, g.RFC3339), '2023-03-12T01:30:00-05:00');
  assert.throws(() => g.loadLocation('Not/AZone'), /unknown time zone Not\/AZone/);
  assert.equal(g.loadLocation('UTC'), g.UTC);
});

test('IANA abbreviation hook overrides ICU names', () => {
  const dubai = g.loadLocation('Asia/Dubai', { abbreviation: () => '+04' });
  assert.equal(g.format(g.unix(0, 0, dubai), 'MST'), '+04');
});

test('civil, toDate and fromDate', () => {
  const t = g.unix(1136239445, 0, g.fixedZone('MST', -7 * 3600));
  assert.deepEqual(g.civil(t), {
    year: 2006, month: 1, day: 2, hour: 15, minute: 4, second: 5, nanosecond: 0, weekday: 1, yearDay: 2,
  });
  assert.equal(g.toDate(t).getTime(), 1136239445000);
  assert.equal(g.fromDate(new Date(1500)).epochNanos, 1_500_000_000n);
  assert.equal(g.toDate(g.unix(-1, 999_999_999)).getTime(), -1);
});
