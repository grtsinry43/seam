/* examples/markdown-demo/server-go/pages/article.go */

package pages

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	seam "github.com/canmi21/seam/src/server/core/go"
)

func loadTemplate() string {
	_, thisFile, _, _ := runtime.Caller(0)
	templatePath := filepath.Join(filepath.Dir(thisFile), "..", "..", "templates", "article.html")
	data, err := os.ReadFile(templatePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read article template: %v\n", err)
		os.Exit(1)
	}
	return string(data)
}

var articleTemplate = loadTemplate()

func ArticlePage() *seam.PageDef {
	return &seam.PageDef{
		Route:    "/",
		Template: articleTemplate,
		Loaders: []seam.LoaderDef{
			{
				DataKey:   "article",
				Procedure: "getArticle",
				InputFn: func(params map[string]string) any {
					return map[string]any{}
				},
			},
		},
	}
}
