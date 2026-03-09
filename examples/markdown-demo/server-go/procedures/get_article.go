/* examples/markdown-demo/server-go/procedures/get_article.go */

package procedures

import (
	"bytes"
	"context"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"

	seam "github.com/canmi21/seam/src/server/core/go"
)

type GetArticleInput struct{}

type GetArticleOutput struct {
	Title       string `json:"title"`
	ContentHtml string `json:"contentHtml"`
}

// Go raw strings cannot contain backticks, so code fences use concatenation
var markdownSource = "**Bold text** and *italic text* with ~~strikethrough~~.\n\n" +
	"A [link to Seam](https://github.com/canmi21/seam) for reference.\n\n" +
	"> Markdown rendered as raw HTML via the `:html` template slot —\n" +
	"> no escaping, no sanitization overhead.\n\n" +
	"---\n\n" +
	"```go\n" +
	"md := goldmark.New(\n" +
	"    goldmark.WithExtensions(extension.Strikethrough),\n" +
	")\n" +
	"var buf bytes.Buffer\n" +
	"md.Convert(source, &buf)\n" +
	"```\n\n" +
	"Inline `code` also works.\n"

func renderMarkdown(source string) (string, error) {
	md := goldmark.New(
		goldmark.WithExtensions(extension.Strikethrough),
	)
	var buf bytes.Buffer
	if err := md.Convert([]byte(source), &buf); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func GetArticle() *seam.ProcedureDef {
	return seam.Query[GetArticleInput, GetArticleOutput]("getArticle",
		func(ctx context.Context, in GetArticleInput) (GetArticleOutput, error) {
			html, err := renderMarkdown(markdownSource)
			if err != nil {
				return GetArticleOutput{}, err
			}
			return GetArticleOutput{
				Title:       "Markdown Demo (Go + goldmark)",
				ContentHtml: html,
			}, nil
		})
}
