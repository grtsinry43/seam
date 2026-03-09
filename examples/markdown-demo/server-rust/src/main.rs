/* examples/markdown-demo/server-rust/src/main.rs */
#![allow(clippy::print_stdout, clippy::print_stderr)]

mod pages;
mod procedures;

use std::env;

use seam_server::SeamServer;
use seam_server_axum::IntoAxumRouter;

use pages::article_page;
use procedures::get_article::get_article_procedure;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
	let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
	let addr = format!("0.0.0.0:{port}");

	SeamServer::new().procedure(get_article_procedure()).page(article_page()).serve(&addr).await
}
