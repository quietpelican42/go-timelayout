// Command gotimeoracle runs Format and Parse cases through the real Go time
// package. It reads a JSON array of cases on stdin and writes a JSON array of
// results on stdout.
//
// Format case: ["f", layout, epochNanos, zone]
// Parse case:  ["p", layout, value, zone]
// zone: 0 (Parse with the local zone set to UTC), "UTC", ["fixed", name, offset],
// or ["iana", name].
//
// Results: ["s", string] | ["e", message] | ["t", epochNanos, offset, name]
package main

import (
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"time"
)

func location(z any) (*time.Location, error) {
	switch v := z.(type) {
	case string:
		if v == "UTC" {
			return time.UTC, nil
		}
	case []any:
		switch v[0].(string) {
		case "fixed":
			return time.FixedZone(v[1].(string), int(v[2].(float64))), nil
		case "iana":
			return time.LoadLocation(v[1].(string))
		}
	}
	return nil, fmt.Errorf("bad zone %v", z)
}

func nanosOf(t time.Time) string {
	n := new(big.Int).Mul(big.NewInt(t.Unix()), big.NewInt(1_000_000_000))
	return n.Add(n, big.NewInt(int64(t.Nanosecond()))).String()
}

func main() {
	time.Local = time.UTC
	var cases [][]any
	if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	out := make([][]any, 0, len(cases))
	for _, c := range cases {
		kind, layout := c[0].(string), c[1].(string)
		switch kind {
		case "f":
			ns, _ := new(big.Int).SetString(c[2].(string), 10)
			q, r := new(big.Int).DivMod(ns, big.NewInt(1_000_000_000), new(big.Int))
			loc, err := location(c[3])
			if err != nil {
				out = append(out, []any{"e", err.Error()})
				continue
			}
			t := time.Unix(q.Int64(), r.Int64()).In(loc)
			out = append(out, []any{"s", t.Format(layout)})
		case "p":
			var t time.Time
			var err error
			if c[3] == float64(0) {
				t, err = time.Parse(layout, c[2].(string))
			} else {
				loc, lerr := location(c[3])
				if lerr != nil {
					out = append(out, []any{"e", lerr.Error()})
					continue
				}
				t, err = time.ParseInLocation(layout, c[2].(string), loc)
			}
			if err != nil {
				out = append(out, []any{"e", err.Error()})
				continue
			}
			name, off := t.Zone()
			out = append(out, []any{"t", nanosOf(t), off, name})
		}
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
}
