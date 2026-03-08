/* src/server/core/go/projection_test.go */

package seam

import (
	"testing"
)

func TestApplyProjectionBasic(t *testing.T) {
	data := map[string]any{
		"user": map[string]any{
			"name":  "Alice",
			"email": "a@b.c",
			"age":   30,
		},
	}
	proj := map[string][]string{
		"user": {"name", "email"},
	}

	result := applyProjection(data, proj)
	user := result["user"].(map[string]any)

	if user["name"] != "Alice" {
		t.Errorf("expected name=Alice, got %v", user["name"])
	}
	if user["email"] != "a@b.c" {
		t.Errorf("expected email=a@b.c, got %v", user["email"])
	}
	if _, exists := user["age"]; exists {
		t.Error("age should have been pruned")
	}
}

func TestApplyProjectionArrayFields(t *testing.T) {
	data := map[string]any{
		"repos": []any{
			map[string]any{"title": "A", "desc": "...", "stars": 100},
			map[string]any{"title": "B", "desc": "...", "stars": 200},
		},
	}
	proj := map[string][]string{
		"repos": {"$.title"},
	}

	result := applyProjection(data, proj)
	repos := result["repos"].([]any)

	if len(repos) != 2 {
		t.Fatalf("expected 2 repos, got %d", len(repos))
	}
	first := repos[0].(map[string]any)
	if first["title"] != "A" {
		t.Errorf("expected title=A, got %v", first["title"])
	}
	if _, exists := first["desc"]; exists {
		t.Error("desc should have been pruned")
	}
}

func TestApplyProjectionNilPassthrough(t *testing.T) {
	data := map[string]any{"user": "full data"}
	result := applyProjection(data, nil)

	if result["user"] != "full data" {
		t.Error("nil projections should return data unchanged")
	}
}

func TestApplyProjectionErrorMarkerBypass(t *testing.T) {
	data := map[string]any{
		"user": map[string]any{
			"__error": true,
			"code":    "NOT_FOUND",
			"message": "User not found",
		},
	}
	proj := map[string][]string{
		"user": {"name"},
	}

	result := applyProjection(data, proj)
	user := result["user"].(map[string]any)

	if user["__error"] != true {
		t.Error("__error should be true")
	}
	if user["code"] != "NOT_FOUND" {
		t.Errorf("expected code=NOT_FOUND, got %v", user["code"])
	}
	if user["message"] != "User not found" {
		t.Errorf("expected message='User not found', got %v", user["message"])
	}
}

func TestIsLoaderError(t *testing.T) {
	tests := []struct {
		name string
		val  any
		want bool
	}{
		{"valid error marker", map[string]any{"__error": true, "code": "NOT_FOUND", "message": "nope"}, true},
		{"missing code", map[string]any{"__error": true, "message": "nope"}, false},
		{"missing message", map[string]any{"__error": true, "code": "NOT_FOUND"}, false},
		{"__error false", map[string]any{"__error": false, "code": "NOT_FOUND", "message": "nope"}, false},
		{"not a map", "hello", false},
		{"nil", nil, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := isLoaderError(tc.val); got != tc.want {
				t.Errorf("isLoaderError(%v) = %v, want %v", tc.val, got, tc.want)
			}
		})
	}
}

func TestApplyProjectionMissingKeyPassthrough(t *testing.T) {
	data := map[string]any{
		"user":  map[string]any{"name": "Alice", "age": 30},
		"theme": "dark",
	}
	proj := map[string][]string{
		"user": {"name"},
	}

	result := applyProjection(data, proj)

	// "theme" has no projection — should be kept as-is
	if result["theme"] != "dark" {
		t.Error("keys without projection should pass through")
	}
	user := result["user"].(map[string]any)
	if _, exists := user["age"]; exists {
		t.Error("age should have been pruned")
	}
}
