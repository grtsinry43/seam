/* src/server/core/go/build_loader_test.go */

package seam

import (
	"os"
	"testing"
)

func TestLoadBuildEmptyDir(t *testing.T) {
	dir := t.TempDir()
	build := LoadBuild(dir)

	if len(build.Pages) != 0 {
		t.Fatalf("expected 0 pages, got %d", len(build.Pages))
	}
	if build.RpcHashMap != nil {
		t.Fatal("expected nil RpcHashMap")
	}
	if build.I18nConfig != nil {
		t.Fatal("expected nil I18nConfig")
	}
}

func TestLoadBuildWithHashMap(t *testing.T) {
	dir := t.TempDir()
	hashJSON := `{"salt":"abc","batch":"b1","procedures":{"foo":"h1"}}`
	if err := os.WriteFile(dir+"/rpc-hash-map.json", []byte(hashJSON), 0o644); err != nil {
		t.Fatal(err)
	}

	build := LoadBuild(dir)
	if build.RpcHashMap == nil {
		t.Fatal("expected non-nil RpcHashMap")
	}
	if build.RpcHashMap.Procedures["foo"] != "h1" {
		t.Fatalf("expected hash h1, got %s", build.RpcHashMap.Procedures["foo"])
	}
}

func TestRouterBuild(t *testing.T) {
	r := NewRouter()

	build := BuildOutput{
		Pages: []PageDef{{Route: "/test", Template: "<p>hi</p>"}},
		RpcHashMap: &RpcHashMap{
			Batch:      "b1",
			Procedures: map[string]string{"foo": "h1"},
		},
		I18nConfig: &I18nConfig{
			Locales: []string{"en"},
			Default: "en",
		},
	}

	r.Build(build)

	if len(r.pages) != 1 || r.pages[0].Route != "/test" {
		t.Fatalf("expected 1 page with route /test, got %v", r.pages)
	}
	if r.rpcHashMap == nil || r.rpcHashMap.Batch != "b1" {
		t.Fatal("expected rpcHashMap with batch b1")
	}
	if r.i18nConfig == nil || r.i18nConfig.Default != "en" {
		t.Fatal("expected i18nConfig with default en")
	}
}

func TestRouterBuildNilFields(t *testing.T) {
	r := NewRouter()
	r.RpcHashMap(&RpcHashMap{Batch: "existing"})

	// Build with nil fields should not overwrite existing values
	r.Build(BuildOutput{})

	if r.rpcHashMap == nil || r.rpcHashMap.Batch != "existing" {
		t.Fatal("expected existing rpcHashMap to be preserved")
	}
}
