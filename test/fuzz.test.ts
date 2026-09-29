import assert from 'node:assert/strict';
import test from 'node:test';
import { Rng, evalCase, randomLayout, randomNanos, randomValue, randomZone } from '../oracle/cases.ts';
import * as g from '../src/index.ts';

// Property fuzz with no oracle: nothing may throw anything but ParseError, and a
// formatted time must parse back to itself when the layout carries enough information.
// The heavier differential fuzz against real Go is `npm run verify`.

test('format never throws, parse throws only ParseError', () => {
  const rng = new Rng(4242);
  for (let i = 0; i < 20000; i++) {
    const layout = randomLayout(rng);
    const zone = randomZone(rng, false);
    const [kind, out] = evalCase(['f', layout, randomNanos(rng), zone]);
    assert.equal(kind, 's', `format threw for ${JSON.stringify(layout)}: ${out}`);
    const value = rng.chance(0.5) ? randomValue(rng) : out;
    const r = evalCase(['p', layout, value, zone === 'UTC' ? 0 : zone]);
    if (r[0] === 'e') assert.match(r[1], /^parsing time "/, `unexpected error: ${r[1]}`);
  }
});

test('round trip through a lossless layout, including year 0 to 9999 and odd offsets', () => {
  const rng = new Rng(7);
  const layout = '2006-01-02T15:04:05.999999999Z07:00:00';
  for (let i = 0; i < 5000; i++) {
    const zone = randomZone(rng, false);
    if (zone !== 'UTC' && (zone === 0 || zone[0] !== 'fixed')) continue;
    const nanos = BigInt(randomNanos(rng, false));
    const t = g.inLocation(nanos, zone === 'UTC' ? g.UTC : g.fixedZone(zone[1], zone[2]));
    if (Math.abs(t.offsetSeconds) >= 86400) continue; // Go rejects zone offset hours above 24
    const s = g.format(t, layout);
    if (!/^\d{4}-/.test(s)) continue; // Parse takes years 0000..9999 only
    const back = g.parse(layout, s);
    assert.equal(back.epochNanos, t.epochNanos, s);
    assert.equal(back.offsetSeconds, t.offsetSeconds, s);
  }
});

test('hostile input finishes quickly and is rejected', () => {
  const start = Date.now();
  for (const [layout, value] of [
    ['2006-01-02', '9'.repeat(100000)],
    ['.' + '0'.repeat(100000), '.' + '1'.repeat(100000)],
    ['MST', 'A'.repeat(100000)],
    ['-07:00', '+' + '9'.repeat(100000)],
    ['05', '10' + '.9'.repeat(50000)],
  ] as const) {
    try {
      g.parse(layout, value);
    } catch (e) {
      assert.ok(e instanceof g.ParseError);
    }
  }
  assert.ok(Date.now() - start < 3000, 'took too long');
});
