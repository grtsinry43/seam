/* examples/markdown-demo/server-rust/src/procedures/get_article.rs */

use pulldown_cmark::{Options, Parser, html};
use seam_server::{SeamError, SeamType, seam_procedure};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, SeamType)]
pub struct GetArticleInput {}

#[derive(Serialize, SeamType)]
pub struct GetArticleOutput {
	pub title: String,
	#[serde(rename = "contentHtml")]
	pub content_html: String,
}

const MARKDOWN_SOURCE: &str = r#"
**Bold text** and *italic text* with ~~strikethrough~~.

A [link to Seam](https://github.com/canmi21/seam) for reference.

> Markdown rendered as raw HTML via the `:html` template slot —
> no escaping, no sanitization overhead.

---

```rust
use pulldown_cmark::{Options, Parser, html};

let opts = Options::ENABLE_STRIKETHROUGH;
let parser = Parser::new_ext(source, opts);
let mut output = String::new();
html::push_html(&mut output, parser);
```

Inline `code` also works.
"#;

fn render_markdown(source: &str) -> String {
	let opts = Options::ENABLE_STRIKETHROUGH;
	let parser = Parser::new_ext(source, opts);
	let mut output = String::new();
	html::push_html(&mut output, parser);
	output
}

#[seam_procedure(name = "getArticle")]
pub async fn get_article(_input: GetArticleInput) -> Result<GetArticleOutput, SeamError> {
	Ok(GetArticleOutput {
		title: "Markdown Demo (Rust + pulldown-cmark)".to_string(),
		content_html: render_markdown(MARKDOWN_SOURCE),
	})
}
