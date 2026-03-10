/* src/server/core/go/handler_manifest_test.go */

package seam

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestManifestSuppressPropagated(t *testing.T) {
	handler := buildHandler(
		[]ProcedureDef{{
			Name:     "warned",
			Handler:  echoHandler(),
			Suppress: []string{"unused"},
		}},
		nil, nil, nil, nil, nil, nil, nil, "", nil, nil,
		HandlerOptions{RPCTimeout: 30 * time.Second}, ValidationModeNever,
	)

	req := httptest.NewRequest("GET", "/_seam/manifest.json", http.NoBody)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	var m map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &m)
	procs := m["procedures"].(map[string]any)
	warned := procs["warned"].(map[string]any)
	suppress := warned["suppress"].([]any)
	if len(suppress) != 1 || suppress[0] != "unused" {
		t.Fatalf("expected suppress=[\"unused\"], got %v", suppress)
	}
}

func TestManifestSuppressOmitted(t *testing.T) {
	handler := buildHandler(
		[]ProcedureDef{{Name: "clean", Handler: echoHandler()}},
		nil, nil, nil, nil, nil, nil, nil, "", nil, nil,
		HandlerOptions{RPCTimeout: 30 * time.Second}, ValidationModeNever,
	)

	req := httptest.NewRequest("GET", "/_seam/manifest.json", http.NoBody)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	var m map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &m)
	procs := m["procedures"].(map[string]any)
	clean := procs["clean"].(map[string]any)
	if _, ok := clean["suppress"]; ok {
		t.Fatal("expected suppress to be omitted when nil")
	}
}

func TestManifestCacheTTL(t *testing.T) {
	handler := buildHandler(
		[]ProcedureDef{{
			Name:    "cached",
			Handler: echoHandler(),
			Cache:   map[string]any{"ttl": 30},
		}},
		nil, nil, nil, nil, nil, nil, nil, "", nil, nil,
		HandlerOptions{RPCTimeout: 30 * time.Second}, ValidationModeNever,
	)

	req := httptest.NewRequest("GET", "/_seam/manifest.json", http.NoBody)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	var m map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &m)
	procs := m["procedures"].(map[string]any)
	cached := procs["cached"].(map[string]any)
	cache := cached["cache"].(map[string]any)
	if cache["ttl"] != float64(30) {
		t.Fatalf("expected cache.ttl=30, got %v", cache["ttl"])
	}
}

func TestManifestCacheFalse(t *testing.T) {
	handler := buildHandler(
		[]ProcedureDef{{
			Name:    "nocache",
			Handler: echoHandler(),
			Cache:   false,
		}},
		nil, nil, nil, nil, nil, nil, nil, "", nil, nil,
		HandlerOptions{RPCTimeout: 30 * time.Second}, ValidationModeNever,
	)

	req := httptest.NewRequest("GET", "/_seam/manifest.json", http.NoBody)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	var m map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &m)
	procs := m["procedures"].(map[string]any)
	nocache := procs["nocache"].(map[string]any)
	if nocache["cache"] != false {
		t.Fatalf("expected cache=false, got %v", nocache["cache"])
	}
}

func TestManifestCacheOmitted(t *testing.T) {
	handler := buildHandler(
		[]ProcedureDef{{Name: "default", Handler: echoHandler()}},
		nil, nil, nil, nil, nil, nil, nil, "", nil, nil,
		HandlerOptions{RPCTimeout: 30 * time.Second}, ValidationModeNever,
	)

	req := httptest.NewRequest("GET", "/_seam/manifest.json", http.NoBody)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	var m map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &m)
	procs := m["procedures"].(map[string]any)
	def := procs["default"].(map[string]any)
	if _, ok := def["cache"]; ok {
		t.Fatal("expected cache to be omitted when nil")
	}
}
