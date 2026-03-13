/* src/server/core/go/handler_page_test.go */

package seam

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestResolveStaticFilePath(t *testing.T) {
	baseDir := "/app/dist/static"
	tests := []struct {
		name     string
		subPath  string
		fileName string
		wantOk   bool
		wantPath string
	}{
		{
			name:     "normal path",
			subPath:  "/css",
			fileName: "style.css",
			wantOk:   true,
			wantPath: filepath.Join(baseDir, "css", "style.css"),
		},
		{
			name:     "root-level file",
			subPath:  "/",
			fileName: "index.html",
			wantOk:   true,
			wantPath: filepath.Join(baseDir, "index.html"),
		},
		{
			name:     "empty subPath",
			subPath:  "",
			fileName: "favicon.ico",
			wantOk:   true,
			wantPath: filepath.Join(baseDir, "favicon.ico"),
		},
		{
			name:     "traversal in subPath",
			subPath:  "/../etc",
			fileName: "passwd",
			wantOk:   false,
		},
		{
			name:     "deep traversal in subPath",
			subPath:  "/../../etc",
			fileName: "shadow",
			wantOk:   false,
		},
		{
			name:     "traversal in fileName",
			subPath:  "/",
			fileName: "../etc/passwd",
			wantOk:   false,
		},
		{
			name:     "dot-dot only subPath",
			subPath:  "..",
			fileName: "passwd",
			wantOk:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := resolveStaticFilePath(baseDir, tt.subPath, tt.fileName)
			if ok != tt.wantOk {
				t.Fatalf("resolveStaticFilePath(%q, %q, %q) ok = %v, want %v", baseDir, tt.subPath, tt.fileName, ok, tt.wantOk)
			}
			if ok && got != tt.wantPath {
				t.Errorf("resolveStaticFilePath(%q, %q, %q) = %q, want %q", baseDir, tt.subPath, tt.fileName, got, tt.wantPath)
			}
		})
	}
}

func TestResolveI18nMessagesPath(t *testing.T) {
	cfg := &I18nConfig{DistDir: "/app/dist"}
	baseDir := filepath.Join(cfg.DistDir, "i18n")

	tests := []struct {
		name      string
		routeHash string
		locale    string
		wantOk    bool
		wantPath  string
	}{
		{
			name:      "normal lookup",
			routeHash: "a1b2c3d4",
			locale:    "en",
			wantOk:    true,
			wantPath:  filepath.Join(baseDir, "a1b2c3d4", "en.json"),
		},
		{
			name:      "traversal in routeHash",
			routeHash: "../../etc",
			locale:    "en",
			wantOk:    false,
		},
		{
			name:      "traversal in locale",
			routeHash: "a1b2c3d4",
			locale:    "../../../etc/passwd",
			wantOk:    false,
		},
		{
			name:      "dot-dot routeHash",
			routeHash: "..",
			locale:    "en",
			wantOk:    false,
		},
		{
			name:      "empty routeHash and locale",
			routeHash: "",
			locale:    "",
			wantOk:    true,
			wantPath:  filepath.Join(baseDir, ".json"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := resolveI18nMessagesPath(cfg, tt.routeHash, tt.locale)
			if ok != tt.wantOk {
				t.Fatalf("resolveI18nMessagesPath(%q, %q) ok = %v, want %v", tt.routeHash, tt.locale, ok, tt.wantOk)
			}
			if ok && got != tt.wantPath {
				t.Errorf("resolveI18nMessagesPath(%q, %q) = %q, want %q", tt.routeHash, tt.locale, got, tt.wantPath)
			}
		})
	}
}

func TestIsKnownRouteHash(t *testing.T) {
	tests := []struct {
		name string
		cfg  *I18nConfig
		hash string
		want bool
	}{
		{
			name: "empty string",
			cfg:  &I18nConfig{},
			hash: "",
			want: false,
		},
		{
			name: "hash in ContentHashes",
			cfg: &I18nConfig{
				ContentHashes: map[string]map[string]string{
					"abc12345": {"en": "c1d2"},
				},
			},
			hash: "abc12345",
			want: true,
		},
		{
			name: "hash in RouteHashes values",
			cfg: &I18nConfig{
				RouteHashes: map[string]string{
					"/dashboard": "rh123456",
				},
			},
			hash: "rh123456",
			want: true,
		},
		{
			name: "RouteHashes key is not matched",
			cfg: &I18nConfig{
				RouteHashes: map[string]string{
					"/dashboard": "rh123456",
				},
			},
			hash: "/dashboard",
			want: false,
		},
		{
			name: "hash in Messages first locale",
			cfg: &I18nConfig{
				Messages: map[string]map[string]json.RawMessage{
					"en": {"msg11111": json.RawMessage(`{"hello":"world"}`)},
				},
			},
			hash: "msg11111",
			want: true,
		},
		{
			name: "hash in Messages second locale",
			cfg: &I18nConfig{
				Messages: map[string]map[string]json.RawMessage{
					"en": {"enonly000": json.RawMessage(`{}`)},
					"ja": {"jaonly000": json.RawMessage(`{}`)},
				},
			},
			hash: "jaonly000",
			want: true,
		},
		{
			name: "unknown hash with all maps populated",
			cfg: &I18nConfig{
				ContentHashes: map[string]map[string]string{"ch000000": {"en": "x"}},
				RouteHashes:   map[string]string{"/": "rh000000"},
				Messages:      map[string]map[string]json.RawMessage{"en": {"ms000000": json.RawMessage(`{}`)}},
			},
			hash: "notfound",
			want: false,
		},
		{
			name: "nil maps",
			cfg:  &I18nConfig{},
			hash: "anything",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isKnownRouteHash(tt.cfg, tt.hash)
			if got != tt.want {
				t.Errorf("isKnownRouteHash(%q) = %v, want %v", tt.hash, got, tt.want)
			}
		})
	}
}
