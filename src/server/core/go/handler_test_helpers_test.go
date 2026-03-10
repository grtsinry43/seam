/* src/server/core/go/handler_test_helpers_test.go */

package seam

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func slowHandler(d time.Duration) HandlerFunc {
	return func(ctx context.Context, input json.RawMessage) (any, error) {
		select {
		case <-time.After(d):
			return map[string]string{"ok": "true"}, nil
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}

func echoHandler() HandlerFunc {
	return func(ctx context.Context, input json.RawMessage) (any, error) {
		var data any
		_ = json.Unmarshal(input, &data)
		return data, nil
	}
}

func validationHandler() http.Handler {
	return buildHandler(
		[]ProcedureDef{{
			Name:        "greet",
			InputSchema: map[string]any{"properties": map[string]any{"name": map[string]any{"type": "string"}}},
			Handler:     echoHandler(),
		}},
		nil, nil, nil, nil, nil, nil, nil, "", nil, nil,
		HandlerOptions{RPCTimeout: 30 * time.Second}, ValidationModeAlways,
	)
}

func batchValidationBody() string {
	return strings.Join([]string{
		`{"calls":[`,
		`{"procedure":"greet","input":{"name":42}},`,
		`{"procedure":"greet","input":{"name":"OK"}}`,
		"]}",
	}, "")
}
