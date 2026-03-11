/* src/server/core/go/handler_timeout_test.go */

package seam

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRPCTimeout(t *testing.T) {
	handler := buildHandler(
		[]ProcedureDef{{Name: "slow", Handler: slowHandler(100 * time.Millisecond)}},
		nil, nil, nil, nil, nil, nil, nil, "", nil, nil,
		nil, HandlerOptions{RPCTimeout: 10 * time.Millisecond}, ValidationModeNever,
	)

	req := httptest.NewRequest("POST", "/_seam/procedure/slow", strings.NewReader("{}"))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusGatewayTimeout {
		t.Fatalf("expected 504, got %d", w.Code)
	}

	var resp map[string]map[string]string
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"]["message"] != "RPC timed out" {
		t.Fatalf("unexpected error message: %s", resp["error"]["message"])
	}
}

func TestRPCZeroTimeout(t *testing.T) {
	handler := buildHandler(
		[]ProcedureDef{{Name: "slow", Handler: slowHandler(50 * time.Millisecond)}},
		nil, nil, nil, nil, nil, nil, nil, "", nil, nil,
		nil, HandlerOptions{RPCTimeout: 0}, ValidationModeNever,
	)

	req := httptest.NewRequest("POST", "/_seam/procedure/slow", strings.NewReader("{}"))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 with zero timeout, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPageTimeout(t *testing.T) {
	handler := buildHandler(
		[]ProcedureDef{{Name: "fetchData", Handler: slowHandler(100 * time.Millisecond)}},
		nil, nil, nil, nil,
		[]PageDef{{
			Route:    "/test",
			Template: "<html>__SEAM_DATA__</html>",
			Loaders: []LoaderDef{{
				DataKey:   "data",
				Procedure: "fetchData",
				InputFn:   func(params map[string]string) any { return map[string]string{} },
			}},
		}},
		nil, nil, "", nil, nil,
		nil, HandlerOptions{PageTimeout: 10 * time.Millisecond}, ValidationModeNever,
	)

	req := httptest.NewRequest("GET", "/_seam/page/test", http.NoBody)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusGatewayTimeout {
		t.Fatalf("expected 504, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]map[string]string
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"]["message"] != "Page loader timed out" {
		t.Fatalf("unexpected error message: %s", resp["error"]["message"])
	}
}

func TestSSEIdleTimeout(t *testing.T) {
	subHandler := func(ctx context.Context, input json.RawMessage) (<-chan SubscriptionEvent, error) {
		ch := make(chan SubscriptionEvent, 1)
		ch <- SubscriptionEvent{Value: "hello"}
		return ch, nil
	}

	handler := buildHandler(
		nil,
		[]SubscriptionDef{{Name: "idle-test", Handler: subHandler}},
		nil, nil, nil, nil, nil, nil, "", nil, nil,
		nil, HandlerOptions{SSEIdleTimeout: 50 * time.Millisecond, HeartbeatInterval: 200 * time.Millisecond}, ValidationModeNever,
	)

	req := httptest.NewRequest("GET", "/_seam/procedure/idle-test", http.NoBody)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	body := w.Body.String()
	if !strings.Contains(body, "event: data") {
		t.Fatalf("expected data event, got: %s", body)
	}
	if !strings.Contains(body, "event: complete") {
		t.Fatalf("expected complete event after idle timeout, got: %s", body)
	}
}

func TestSSEZeroIdleTimeout(t *testing.T) {
	subHandler := func(ctx context.Context, input json.RawMessage) (<-chan SubscriptionEvent, error) {
		ch := make(chan SubscriptionEvent, 1)
		ch <- SubscriptionEvent{Value: "hello"}
		close(ch)
		return ch, nil
	}

	handler := buildHandler(
		nil,
		[]SubscriptionDef{{Name: "no-idle", Handler: subHandler}},
		nil, nil, nil, nil, nil, nil, "", nil, nil,
		nil, HandlerOptions{SSEIdleTimeout: 0, HeartbeatInterval: 1 * time.Second}, ValidationModeNever,
	)

	req := httptest.NewRequest("GET", "/_seam/procedure/no-idle", http.NoBody)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	body := w.Body.String()
	if !strings.Contains(body, "event: data") {
		t.Fatalf("expected data event, got: %s", body)
	}
	if !strings.Contains(body, "event: complete") {
		t.Fatalf("expected complete event, got: %s", body)
	}
}

func TestSSESubscriptionStartsWithHeartbeatAndPropagatesLastEventID(t *testing.T) {
	subHandler := func(ctx context.Context, input json.RawMessage) (<-chan SubscriptionEvent, error) {
		ch := make(chan SubscriptionEvent, 1)
		ch <- SubscriptionEvent{Value: map[string]string{"lastEventId": LastEventID(ctx)}}
		close(ch)
		return ch, nil
	}

	handler := buildHandler(
		nil,
		[]SubscriptionDef{{Name: "resume", Handler: subHandler}},
		nil, nil, nil, nil, nil, nil, "", nil, nil,
		nil, HandlerOptions{SSEIdleTimeout: 0, HeartbeatInterval: 1 * time.Second}, ValidationModeNever,
	)

	req := httptest.NewRequest("GET", "/_seam/procedure/resume", http.NoBody)
	req.Header.Set("Last-Event-ID", "42")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	body := w.Body.String()
	if !strings.HasPrefix(body, ": heartbeat\n\n") {
		t.Fatalf("expected initial heartbeat, got: %s", body)
	}
	if !strings.Contains(body, `"lastEventId":"42"`) {
		t.Fatalf("expected propagated Last-Event-ID, got: %s", body)
	}
}

func TestSSEStreamStartsWithHeartbeat(t *testing.T) {
	streamHandler := func(ctx context.Context, input json.RawMessage) (<-chan StreamEvent, error) {
		ch := make(chan StreamEvent, 1)
		ch <- StreamEvent{Value: map[string]string{"chunk": "first"}}
		close(ch)
		return ch, nil
	}

	handler := buildHandler(
		nil,
		nil,
		[]StreamDef{{Name: "count-stream", Handler: streamHandler}},
		nil, nil, nil, nil, nil, "", nil, nil,
		nil, HandlerOptions{SSEIdleTimeout: 0, HeartbeatInterval: 1 * time.Second}, ValidationModeNever,
	)

	req := httptest.NewRequest("POST", "/_seam/procedure/count-stream", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	body := w.Body.String()
	if !strings.HasPrefix(body, ": heartbeat\n\n") {
		t.Fatalf("expected initial heartbeat, got: %s", body)
	}
	if !strings.Contains(body, "event: data\nid: 0\n") {
		t.Fatalf("expected stream data event with id, got: %s", body)
	}
}
