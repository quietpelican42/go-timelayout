import { fromBytes, quote, toBytes } from './bytes.ts';

/** Describes a problem parsing a time string. `message` equals Go's ParseError.Error(). */
export class ParseError extends Error {
  readonly layout: string;
  readonly value: string;
  readonly layoutElem: string;
  readonly valueElem: string;
  /** Go's ParseError.Message: the detail after the quoted value, or "". */
  readonly detail: string;

  constructor(layout: string, value: string, layoutElem: string, valueElem: string, detail: string, message?: string) {
    super(message ?? goMessage(toBytes(layout), toBytes(value), toBytes(layoutElem), toBytes(valueElem), detail));
    this.name = 'ParseError';
    this.layout = layout;
    this.value = value;
    this.layoutElem = layoutElem;
    this.valueElem = valueElem;
    this.detail = detail;
  }
}

/** Go's ParseError.Error(), computed from binary strings so invalid UTF-8 stays byte-exact. */
function goMessage(layout: string, value: string, layoutElem: string, valueElem: string, detail: string): string {
  if (detail === '') {
    return (
      'parsing time ' +
      quote(value) +
      ' as ' +
      quote(layout) +
      ': cannot parse ' +
      quote(valueElem) +
      ' as ' +
      quote(layoutElem)
    );
  }
  return 'parsing time ' + quote(value) + detail;
}

/** Internal: builds a ParseError from binary strings (as used by the parser). */
export function newParseError(layout: string, value: string, layoutElem: string, valueElem: string, detail: string): ParseError {
  return new ParseError(
    fromBytes(layout),
    fromBytes(value),
    fromBytes(layoutElem),
    fromBytes(valueElem),
    fromBytes(detail),
    goMessage(layout, value, layoutElem, valueElem, detail),
  );
}
