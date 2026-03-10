/* src/server/core/go/handler_validation_test.go */

package seam

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestValidationRejectsInvalidInput(t *testing.T) {
	h := validationHandler()
	req := httptest.NewRequest("POST", "/_seam/procedure/greet", strings.NewReader(`{"name": 42}`))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	errObj := resp["error"].(map[string]any)
	if errObj["code"] != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %v", errObj["code"])
	}
	msg := errObj["message"].(string)
	if !strings.Contains(msg, "Input validation failed") {
		t.Fatalf("unexpected message: %s", msg)
	}
	details, ok := errObj["details"].([]any)
	if !ok || len(details) == 0 {
		t.Fatal("expected non-empty details array")
	}
	detail := details[0].(map[string]any)
	if detail["path"] != "/name" {
		t.Fatalf("expected path /name, got %v", detail["path"])
	}
	if detail["expected"] != "string" {
		t.Fatalf("expected type string, got %v", detail["expected"])
	}
}

func TestValidationAcceptsValidInput(t *testing.T) {
	h := validationHandler()
	req := httptest.NewRequest("POST", "/_seam/procedure/greet", strings.NewReader(`{"name": "Seam"}`))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestValidationBatchOneInvalid(t *testing.T) {
	hashMap := &RpcHashMap{Batch: "_batch", Procedures: map[string]string{"greet": "greet"}}
	h := buildHandler(
		[]ProcedureDef{{
			Name:        "greet",
			InputSchema: map[string]any{"properties": map[string]any{"name": map[string]any{"type": "string"}}},
			Handler:     echoHandler(),
		}},
		nil, nil, nil, nil, nil, hashMap, nil, "", nil, nil,
		HandlerOptions{RPCTimeout: 30 * time.Second}, ValidationModeAlways,
	)
	req := httptest.NewRequest("POST", "/_seam/procedure/_batch", strings.NewReader(batchValidationBody()))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	results := resp["data"].(map[string]any)["results"].([]any)
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	r0 := results[0].(map[string]any)
	if r0["ok"] != false {
		t.Fatal("expected first call to fail")
	}
	errObj := r0["error"].(map[string]any)
	if errObj["code"] != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %v", errObj["code"])
	}
	r1 := results[1].(map[string]any)
	if r1["ok"] != true {
		t.Fatal("expected second call to succeed")
	}
}

func TestValidationNeverSkips(t *testing.T) {
	h := buildHandler(
		[]ProcedureDef{{
			Name:        "greet",
			InputSchema: map[string]any{"properties": map[string]any{"name": map[string]any{"type": "string"}}},
			Handler:     echoHandler(),
		}},
		nil, nil, nil, nil, nil, nil, nil, "", nil, nil,
		HandlerOptions{RPCTimeout: 30 * time.Second}, ValidationModeNever,
	)
	req := httptest.NewRequest("POST", "/_seam/procedure/greet", strings.NewReader(`{"name": 42}`))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 with validation disabled, got %d: %s", w.Code, w.Body.String())
	}
}

func TestValidationErrorDetailsShape(t *testing.T) {
	h := validationHandler()
	req := httptest.NewRequest("POST", "/_seam/procedure/greet", strings.NewReader(`{"name": 42}`))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	var resp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if resp["ok"] != false {
		t.Fatal("expected ok=false")
	}
	errObj := resp["error"].(map[string]any)
	if errObj["code"] != "VALIDATION_ERROR" {
		t.Fatal("expected VALIDATION_ERROR code")
	}
	if errObj["transient"] != false {
		t.Fatal("expected transient=false")
	}
	details := errObj["details"].([]any)
	detail := details[0].(map[string]any)
	if _, ok := detail["path"]; !ok {
		t.Fatal("detail missing path field")
	}
	if _, ok := detail["expected"]; !ok {
		t.Fatal("detail missing expected field")
	}
	if _, ok := detail["actual"]; !ok {
		t.Fatal("detail missing actual field")
	}
}
