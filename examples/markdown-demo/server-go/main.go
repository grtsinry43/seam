/* examples/markdown-demo/server-go/main.go */

package main

import (
	"fmt"
	"net/http"
	"os"

	seam "github.com/canmi21/seam/src/server/core/go"

	"github.com/canmi21/seam/examples/markdown-demo/server-go/pages"
	"github.com/canmi21/seam/examples/markdown-demo/server-go/procedures"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	r := seam.NewRouter()
	r.Procedure(procedures.GetArticle())
	r.Page(pages.ArticlePage())

	mux := http.NewServeMux()
	mux.Handle("/_seam/", r.Handler())

	if err := seam.ListenAndServe("0.0.0.0:"+port, mux); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
