package sysexec

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestRunStreamHandsOverEveryLine(t *testing.T) {
	var mu sync.Mutex
	var got []string
	res, err := RunStream(context.Background(), 10*time.Second, func(stderr bool, line string) {
		mu.Lock()
		defer mu.Unlock()
		if stderr {
			line = "ERR " + line
		}
		got = append(got, line)
	}, "sh", "-c", `echo one; echo two >&2; printf three`)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{"one": true, "ERR two": true, "three": true}
	if len(got) != len(want) {
		t.Fatalf("lines = %q, want %d", got, len(want))
	}
	for _, l := range got {
		if !want[l] {
			t.Errorf("unexpected line %q (all: %q)", l, got)
		}
	}
	if res.Stdout != "one\nthree" || res.Stderr != "two\n" {
		t.Errorf("result not captured: %+v", res)
	}
}

func TestRunStreamReportsFailure(t *testing.T) {
	var n int
	_, err := RunStream(context.Background(), 10*time.Second, func(bool, string) { n++ }, "sh", "-c", `echo boom >&2; exit 3`)
	if err == nil || n != 1 {
		t.Fatalf("err=%v lines=%d", err, n)
	}
}
