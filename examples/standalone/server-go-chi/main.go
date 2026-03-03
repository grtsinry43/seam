/* examples/standalone/server-go-chi/main.go */

package main

import (
	"fmt"
	"log"
	"os"

	"github.com/go-chi/chi/v5"

	seam "github.com/canmi21/seam/src/server/core/go"

	"github.com/canmi21/seam/examples/standalone/server-go/pages"
	"github.com/canmi21/seam/examples/standalone/server-go/procedures"
	"github.com/canmi21/seam/examples/standalone/server-go/subscriptions"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	r := seam.NewRouter()
	r.Procedure(procedures.Greet())
	r.Procedure(procedures.GetUser())
	r.Procedure(procedures.ListUsers())
	r.Subscription(subscriptions.OnCount())
	r.Page(pages.UserPage())

	c := chi.NewRouter()
	c.Handle("/_seam/*", r.Handler())

	addr := fmt.Sprintf(":%s", port)
	fmt.Printf("Seam Go+Chi backend running on http://localhost:%s\n", port)
	log.Fatal(seam.ListenAndServe(addr, c))
}
