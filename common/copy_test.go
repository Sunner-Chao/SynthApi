package common

import (
	"bytes"
	"encoding/json"
	"runtime"
	"testing"
)

type deepCopyBytesFixture struct {
	Raw    json.RawMessage
	Bytes  []byte
	Nested *struct {
		Raw json.RawMessage
	}
}

func TestDeepCopyClonesByteSlices(t *testing.T) {
	src := &deepCopyBytesFixture{
		Raw:   json.RawMessage(`{"input":"original"}`),
		Bytes: []byte("payload"),
		Nested: &struct {
			Raw json.RawMessage
		}{Raw: json.RawMessage(`{"nested":true}`)},
	}

	dst, err := DeepCopy(src)
	if err != nil {
		t.Fatalf("DeepCopy() error = %v", err)
	}
	if !bytes.Equal(dst.Raw, src.Raw) || !bytes.Equal(dst.Bytes, src.Bytes) || !bytes.Equal(dst.Nested.Raw, src.Nested.Raw) {
		t.Fatal("DeepCopy() changed copied data")
	}

	dst.Raw[0] = '['
	dst.Bytes[0] = 'P'
	dst.Nested.Raw[0] = '['
	if src.Raw[0] != '{' || src.Bytes[0] != 'p' || src.Nested.Raw[0] != '{' {
		t.Fatal("DeepCopy() result aliases source byte storage")
	}
}

func TestDeepCopyPreservesNilByteSlices(t *testing.T) {
	src := &deepCopyBytesFixture{}
	dst, err := DeepCopy(src)
	if err != nil {
		t.Fatalf("DeepCopy() error = %v", err)
	}
	if dst.Raw != nil || dst.Bytes != nil {
		t.Fatal("DeepCopy() changed nil byte slices")
	}
}

func BenchmarkDeepCopyRawMessage30MiB(b *testing.B) {
	src := &deepCopyBytesFixture{
		Raw: bytes.Repeat([]byte{'x'}, 30<<20),
	}
	b.SetBytes(int64(len(src.Raw)))
	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		dst, err := DeepCopy(src)
		if err != nil {
			b.Fatal(err)
		}
		runtime.KeepAlive(dst)
	}
}
