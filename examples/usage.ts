import { format, parse, parseInLocation, loadLocation, unix, RFC3339Nano, StampMilli, fixedZone } from '../src/index.ts';

const t = parse(RFC3339Nano, '2023-11-14T22:13:20.123456789+05:30');
console.log(t.epochNanos, t.offsetSeconds);
console.log(format(t, StampMilli));
console.log(format(unix(0, 0, fixedZone('', -18000)), 'Mon Jan _2 15:04:05 MST 2006'));

const ny = loadLocation('America/New_York');
console.log(format(parseInLocation('2006-01-02 15:04', '2023-07-04 12:00', ny), 'Z07:00 MST'));

try {
  parse('2006-01-02', '2023-02-30');
} catch (e) {
  console.log((e as Error).message);
}
