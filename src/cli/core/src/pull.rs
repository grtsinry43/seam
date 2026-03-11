/* src/cli/core/src/pull.rs */

use std::path::Path;

use anyhow::{Context, Result};

use crate::ui;
use seam_codegen::{Manifest, ProcedureType};

fn manifest_url(input: &str) -> String {
	let trimmed = input.trim_end_matches('/');
	if trimmed.ends_with("/_seam/manifest.json") {
		trimmed.to_string()
	} else {
		format!("{trimmed}/_seam/manifest.json")
	}
}

pub async fn fetch_manifest(url_or_base: &str) -> Result<Manifest> {
	let url = manifest_url(url_or_base);
	let resp =
		reqwest::get(&url).await.with_context(|| format!("failed to fetch manifest from {url}"))?;

	let status = resp.status();
	if !status.is_success() {
		anyhow::bail!("server returned HTTP {status}");
	}

	resp.json().await.context("failed to parse manifest JSON")
}

pub async fn pull_manifest(base_url: &str, out: &Path) -> Result<()> {
	ui::banner("pull", None);

	let url = manifest_url(base_url);

	ui::arrow(&url);
	let manifest = fetch_manifest(base_url).await?;

	let total = manifest.procedures.len();

	// Group by procedure type
	let mut queries = 0u32;
	let mut commands = 0u32;
	let mut subscriptions = 0u32;
	let mut streams = 0u32;
	let mut uploads = 0u32;
	for proc in manifest.procedures.values() {
		match proc.proc_type {
			ProcedureType::Query => queries += 1,
			ProcedureType::Command => commands += 1,
			ProcedureType::Subscription => subscriptions += 1,
			ProcedureType::Stream => streams += 1,
			ProcedureType::Upload => uploads += 1,
		}
	}

	let mut parts = Vec::new();
	if queries > 0 {
		parts.push(format!("{queries} {}", if queries == 1 { "query" } else { "queries" }));
	}
	if commands > 0 {
		parts.push(format!("{commands} {}", if commands == 1 { "command" } else { "commands" }));
	}
	if subscriptions > 0 {
		parts.push(format!(
			"{subscriptions} {}",
			if subscriptions == 1 { "subscription" } else { "subscriptions" }
		));
	}
	if streams > 0 {
		parts.push(format!("{streams} {}", if streams == 1 { "stream" } else { "streams" }));
	}
	if uploads > 0 {
		parts.push(format!("{uploads} {}", if uploads == 1 { "upload" } else { "uploads" }));
	}

	let breakdown =
		if parts.is_empty() { String::new() } else { format!(" \u{2014} {}", parts.join(", ")) };

	let channel_count = manifest.channels.len();
	let channel_suffix = if channel_count > 0 {
		let names: Vec<&str> = manifest.channels.keys().map(std::string::String::as_str).collect();
		format!(
			" + {} {} ({})",
			channel_count,
			if channel_count == 1 { "channel" } else { "channels" },
			names.join(", ")
		)
	} else {
		String::new()
	};

	ui::ok(&format!("{total} procedures{breakdown}{channel_suffix}"));

	let json = serde_json::to_string_pretty(&manifest)?;
	std::fs::write(out, json).with_context(|| format!("failed to write {}", out.display()))?;

	ui::ok(&format!("saved {}", out.display()));
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::manifest_url;

	#[test]
	fn manifest_url_accepts_base_url() {
		assert_eq!(manifest_url("http://localhost:3000"), "http://localhost:3000/_seam/manifest.json");
	}

	#[test]
	fn manifest_url_preserves_full_manifest_url() {
		assert_eq!(
			manifest_url("http://localhost:3000/_seam/manifest.json"),
			"http://localhost:3000/_seam/manifest.json"
		);
	}
}
