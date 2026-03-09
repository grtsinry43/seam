/* src/server/core/go/manifest.go */

package seam

import "net/http"

// --- manifest types ---

type manifestSchema struct {
	Version           int                             `json:"version"`
	Context           map[string]contextManifestEntry `json:"context,omitempty"`
	Procedures        map[string]procedureEntry       `json:"procedures"`
	Channels          map[string]channelMeta          `json:"channels,omitempty"`
	TransportDefaults map[string]any                  `json:"transportDefaults"`
}

type contextManifestEntry struct {
	Extract string `json:"extract"`
}

type procedureEntry struct {
	Kind        string   `json:"kind"`
	Input       any      `json:"input"`
	Output      any      `json:"output,omitempty"`
	ChunkOutput any      `json:"chunkOutput,omitempty"`
	Error       any      `json:"error,omitempty"`
	Context     []string `json:"context,omitempty"`
	Suppress    []string `json:"suppress,omitempty"`
	Cache       any      `json:"cache,omitempty"`
}

// --- manifest builder ---

func buildManifest(procedures []ProcedureDef, subscriptions []SubscriptionDef, streams []StreamDef, uploads []UploadDef, channels map[string]channelMeta, contextConfigs map[string]ContextConfig) manifestSchema {
	procs := make(map[string]procedureEntry)
	for i := range procedures {
		p := &procedures[i]
		procType := p.Type
		if procType == "" {
			procType = "query"
		}
		entry := procedureEntry{
			Kind:   procType,
			Input:  p.InputSchema,
			Output: p.OutputSchema,
			Error:  p.ErrorSchema,
		}
		if len(p.ContextKeys) > 0 {
			entry.Context = p.ContextKeys
		}
		if len(p.Suppress) > 0 {
			entry.Suppress = p.Suppress
		}
		if p.Cache != nil {
			entry.Cache = p.Cache
		}
		procs[p.Name] = entry
	}
	for _, s := range subscriptions {
		entry := procedureEntry{
			Kind:   "subscription",
			Input:  s.InputSchema,
			Output: s.OutputSchema,
			Error:  s.ErrorSchema,
		}
		if len(s.ContextKeys) > 0 {
			entry.Context = s.ContextKeys
		}
		if len(s.Suppress) > 0 {
			entry.Suppress = s.Suppress
		}
		procs[s.Name] = entry
	}
	for _, st := range streams {
		entry := procedureEntry{
			Kind:        "stream",
			Input:       st.InputSchema,
			ChunkOutput: st.ChunkOutputSchema,
			Error:       st.ErrorSchema,
		}
		if len(st.ContextKeys) > 0 {
			entry.Context = st.ContextKeys
		}
		if len(st.Suppress) > 0 {
			entry.Suppress = st.Suppress
		}
		procs[st.Name] = entry
	}
	for _, u := range uploads {
		entry := procedureEntry{
			Kind:   "upload",
			Input:  u.InputSchema,
			Output: u.OutputSchema,
			Error:  u.ErrorSchema,
		}
		if len(u.ContextKeys) > 0 {
			entry.Context = u.ContextKeys
		}
		if len(u.Suppress) > 0 {
			entry.Suppress = u.Suppress
		}
		procs[u.Name] = entry
	}
	m := manifestSchema{
		Version:           2,
		Procedures:        procs,
		TransportDefaults: make(map[string]any),
	}
	if len(channels) > 0 {
		m.Channels = channels
	}
	if len(contextConfigs) > 0 {
		ctxManifest := make(map[string]contextManifestEntry)
		for key, cfg := range contextConfigs {
			ctxManifest[key] = contextManifestEntry(cfg)
		}
		m.Context = ctxManifest
	}
	return m
}

// --- manifest handler ---

func (s *appState) handleManifest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(s.manifestJSON)
}
