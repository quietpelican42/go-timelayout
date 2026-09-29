/**
 * Plain-JS checks against the built package, so they run on every Node version
 * in `engines` (the TypeScript suite needs type stripping, Node 24+).
 *
 *   npm run build && node --test test/smoke.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const g = await import('../dist/index.js');

test('formats the reference time', () => {
  const t = g.date(2009, 11, 10, 23, 0, 0, 0, g.UTC);
  assert.equal(g.format(t, g.RFC3339), '2009-11-10T23:00:00Z');
  assert.equal(g.format(t, g.UnixDate), 'Tue Nov 10 23:00:00 UTC 2009');
  assert.equal(g.format(t, 'Jan _2 15:04:05.000'), 'Nov 10 23:00:00.000');
});

test('keeps nanoseconds', () => {
  const t = g.parse(g.RFC3339Nano, '2023-11-14T22:13:20.123456789+05:30');
  assert.equal(t.epochNanos, 1699980200123456789n);
  assert.equal(t.offsetSeconds, 19800);
  assert.equal(g.format(t, g.RFC3339Nano), '2023-11-14T22:13:20.123456789+05:30');
});

test('MST with an unnamed zone prints the numeric offset', () => {
  assert.equal(g.format(g.unix(0, 0, g.fixedZone('', -18000)), 'MST'), '-0500');
});

test('parse errors match Go', () => {
  assert.throws(() => g.parse('2006-01-02', '2023-02-30'), (e) => {
    assert.ok(e instanceof g.ParseError);
    assert.equal(e.message, 'parsing time "2023-02-30": day out of range');
    return true;
  });
});

test('unknown abbreviations are accepted with offset 0', () => {
  const t = g.parse(g.RFC1123, 'Mon, 02 Jan 2006 15:04:05 XYZ');
  assert.equal(t.zoneName, 'XYZ');
  assert.equal(t.offsetSeconds, 0);
});

test('IANA zones resolve through Intl', () => {
  const ny = g.loadLocation('America/New_York');
  assert.equal(g.format(g.unix(1690000000, 0, ny), g.RFC3339), '2023-07-22T00:26:40-04:00');
});
