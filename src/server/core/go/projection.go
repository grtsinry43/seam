/* src/server/core/go/projection.go */

package seam

// applyProjection prunes loader data to only projected fields.
// nil projections = keep all data.
func applyProjection(data map[string]any, projections map[string][]string) map[string]any {
	if len(projections) == 0 {
		return data
	}

	result := make(map[string]any, len(data))
	for key, value := range data {
		fields, hasProjection := projections[key]
		if !hasProjection {
			result[key] = value
			continue
		}
		// Error markers pass through unchanged (per-loader error boundary)
		if isLoaderError(value) {
			result[key] = value
			continue
		}
		result[key] = pruneValue(value, fields)
	}
	return result
}

func pruneValue(value any, fields []string) any {
	var arrayFields []string
	var plainFields []string

	for _, f := range fields {
		if f == "$" {
			// Standalone $ = keep entire array elements
			return value
		}
		if len(f) > 2 && f[:2] == "$." {
			arrayFields = append(arrayFields, f[2:])
		} else {
			plainFields = append(plainFields, f)
		}
	}

	if len(arrayFields) > 0 {
		if arr, ok := value.([]any); ok {
			pruned := make([]any, len(arr))
			for i, item := range arr {
				if m, ok := item.(map[string]any); ok {
					pruned[i] = pickFields(m, arrayFields)
				} else {
					pruned[i] = item
				}
			}
			return pruned
		}
	}

	if len(plainFields) > 0 {
		if m, ok := value.(map[string]any); ok {
			return pickFields(m, plainFields)
		}
	}

	return value
}

// pickFields extracts only the listed fields from a map.
// Supports dot-separated nested paths.
func pickFields(source map[string]any, fields []string) map[string]any {
	result := make(map[string]any)
	for _, field := range fields {
		val := getNestedField(source, field)
		if val != nil {
			setNestedField(result, field, val)
		}
	}
	return result
}

func getNestedField(source map[string]any, path string) any {
	parts := splitDot(path)
	var current any = source
	for _, part := range parts {
		m, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current, ok = m[part]
		if !ok {
			return nil
		}
	}
	return current
}

func setNestedField(target map[string]any, path string, value any) {
	parts := splitDot(path)
	current := target
	for i := 0; i < len(parts)-1; i++ {
		key := parts[i]
		if next, ok := current[key]; ok {
			if nextMap, ok := next.(map[string]any); ok {
				current = nextMap
				continue
			}
		}
		next := make(map[string]any)
		current[key] = next
		current = next
	}
	current[parts[len(parts)-1]] = value
}

// isLoaderError checks if a value is a per-loader error marker.
func isLoaderError(v any) bool {
	m, ok := v.(map[string]any)
	if !ok {
		return false
	}
	errFlag, _ := m["__error"].(bool)
	if !errFlag {
		return false
	}
	_, hasCode := m["code"].(string)
	_, hasMsg := m["message"].(string)
	return hasCode && hasMsg
}

// splitDot splits a string by '.' without allocating for simple cases.
func splitDot(s string) []string {
	for i := range s {
		if s[i] != '.' {
			continue
		}
		// Has dots, use full split
		var parts []string
		start := 0
		for j := range s {
			if s[j] == '.' {
				parts = append(parts, s[start:j])
				start = j + 1
			}
		}
		parts = append(parts, s[start:])
		return parts
	}
	return []string{s}
}
