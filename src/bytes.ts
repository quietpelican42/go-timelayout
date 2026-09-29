// Go strings are UTF-8 byte sequences and time/format.go indexes them by byte.
// To keep the port exact, layouts and values are converted to "binary strings"
// (one UTF-16 unit per UTF-8 byte) before they are processed.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

/** UTF-16 string to binary string (one char per UTF-8 byte). */
export function toBytes(s: string): string {
  if (isAscii(s)) return s;
  const bytes = encoder.encode(s);
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
}

/** Binary string back to a UTF-16 string. Invalid UTF-8 becomes U+FFFD. */
export function fromBytes(s: string): string {
  if (isAscii(s)) return s;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return decoder.decode(bytes);
}

/** Decode one UTF-8 sequence at i the way Go's range loop does: [rune, width]. */
function decodeRune(s: string, i: number): [number, number] {
  const b0 = s.charCodeAt(i);
  if (b0 < 0x80) return [b0, 1];
  const cont = (k: number, lo = 0x80, hi = 0xbf): number => {
    if (i + k >= s.length) return -1;
    const c = s.charCodeAt(i + k);
    return c >= lo && c <= hi ? c & 0x3f : -1;
  };
  if (b0 >= 0xc2 && b0 <= 0xdf) {
    const c1 = cont(1);
    if (c1 >= 0) return [((b0 & 0x1f) << 6) | c1, 2];
  } else if (b0 >= 0xe0 && b0 <= 0xef) {
    const lo = b0 === 0xe0 ? 0xa0 : 0x80;
    const hi = b0 === 0xed ? 0x9f : 0xbf;
    const c1 = cont(1, lo, hi);
    const c2 = c1 >= 0 ? cont(2) : -1;
    if (c2 >= 0) return [((b0 & 0x0f) << 12) | (c1 << 6) | c2, 3];
  } else if (b0 >= 0xf0 && b0 <= 0xf4) {
    const lo = b0 === 0xf0 ? 0x90 : 0x80;
    const hi = b0 === 0xf4 ? 0x8f : 0xbf;
    const c1 = cont(1, lo, hi);
    const c2 = c1 >= 0 ? cont(2) : -1;
    const c3 = c2 >= 0 ? cont(3) : -1;
    if (c3 >= 0) return [((b0 & 0x07) << 18) | (c1 << 12) | (c2 << 6) | c3, 4];
  }
  return [0xfffd, 1];
}

const lowerhex = '0123456789abcdef';

/**
 * Port of the unexported quote() in time/format.go, used by ParseError.
 * Takes a binary string. Everything outside printable ASCII is escaped per byte.
 */
export function quote(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; ) {
    const [c, width] = decodeRune(s, i);
    if (c >= 0x80 || c < 0x20) {
      for (let j = 0; j < width; j++) {
        const b = s.charCodeAt(i + j);
        out += '\\x' + lowerhex[b >> 4] + lowerhex[b & 0xf];
      }
    } else {
      if (c === 0x22 || c === 0x5c) out += '\\';
      out += String.fromCharCode(c);
    }
    i += width;
  }
  return out + '"';
}
