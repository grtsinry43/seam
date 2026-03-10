/* src/cli/core/src/build/config/mod.rs */

use std::hash::{Hash, Hasher};
use std::path::Path;

use anyhow::{Result, bail};

use crate::config::{I18nSection, OutputMode, SeamConfig};
use crate::ui;

#[derive(Debug, Clone)]
pub struct BuildConfig {
	pub output: OutputMode,
	pub entry: String,
	pub routes: String,
	pub out_dir: String,
	pub renderer: String,
	pub backend_build_command: Option<String>,
	pub router_file: Option<String>,
	pub manifest_command: Option<String>,
	pub typecheck_command: Option<String>,
	pub is_fullstack: bool,
	pub obfuscate: bool,
	pub sourcemap: bool,
	pub type_hint: bool,
	pub hash_length: usize,
	pub rpc_salt: Option<String>,
	pub root_id: String,
	pub data_id: String,
	pub pages_dir: Option<String>,
	pub i18n: Option<I18nSection>,
	pub config_path: Option<String>,
}

impl BuildConfig {
	pub fn from_seam_config(config: &SeamConfig) -> Result<Self> {
		let build = &config.build;

		if build.bundler_command.is_some() || config.frontend.build_command.is_some() {
			bail!(
				"bundlerCommand has been removed -- use frontend.entry with the built-in bundler instead"
			);
		}

		let pages_dir = build.pages_dir.clone();
		let routes = match (&build.routes, &pages_dir) {
			(Some(_), Some(_)) => bail!("build.routes and build.pages_dir are mutually exclusive"),
			(Some(r), None) => r.clone(),
			(None, Some(_)) => ".seam/generated/routes.ts".to_string(),
			(None, None) => bail!("either build.routes or build.pages_dir is required in config"),
		};

		let out_dir = build
			.out_dir
			.clone()
			.or_else(|| config.frontend.out_dir.clone())
			.unwrap_or_else(|| ".seam/output".to_string());

		let entry =
			config.frontend.entry.clone().ok_or_else(|| anyhow::anyhow!("frontend.entry is required"))?;

		let renderer = build.renderer.clone().unwrap_or_else(|| "react".to_string());
		if renderer != "react" {
			bail!("unsupported renderer '{renderer}' (only 'react' is currently supported)");
		}
		let backend_build_command = build.backend_build_command.clone();
		let router_file = build.router_file.clone();
		let manifest_command = build.manifest_command.clone();
		let typecheck_command = build.typecheck_command.clone();
		let is_fullstack = backend_build_command.is_some();
		let obfuscate = build.obfuscate.unwrap_or(true);
		let sourcemap = build.sourcemap.unwrap_or(false);
		let type_hint = build.type_hint.unwrap_or(true);
		let hash_length = build.hash_length.unwrap_or(12) as usize;
		if !(4..=64).contains(&hash_length) {
			bail!("hash_length must be between 4 and 64 (got {hash_length})");
		}

		let root_id = config.frontend.root_id.clone();
		let data_id = config.frontend.data_id.clone();
		let i18n = config.i18n.clone();
		let config_path = config.config_file_path.clone();

		Ok(Self {
			output: config.output,
			entry,
			routes,
			out_dir,
			renderer,
			backend_build_command,
			router_file,
			manifest_command,
			typecheck_command,
			is_fullstack,
			obfuscate,
			sourcemap,
			type_hint,
			hash_length,
			rpc_salt: None,
			root_id,
			data_id,
			pages_dir,
			i18n,
			config_path,
		})
	}

	#[allow(clippy::unused_self)]
	pub fn dist_dir(&self) -> &str {
		".seam/dist"
	}

	pub fn bundler_manifest(&self) -> String {
		format!("{}/.vite/manifest.json", self.dist_dir())
	}

	pub fn warn_stale_vite_config(base_dir: &Path) {
		for name in ["vite.config.ts", "vite.config.js", "vite.config.mjs"] {
			if base_dir.join(name).exists() {
				ui::warn(&format!("{name} is ignored -- move settings to seam.config.ts vite field"));
			}
		}
	}

	pub fn from_seam_config_dev(config: &SeamConfig) -> Result<Self> {
		let mut bc = Self::from_seam_config(config)?;
		bc.obfuscate = config.dev.obfuscate.unwrap_or(false);
		bc.sourcemap = config.dev.sourcemap.unwrap_or(true);
		bc.type_hint = config.dev.type_hint.unwrap_or(true);
		if let Some(n) = config.dev.hash_length {
			bc.hash_length = n as usize;
		}
		bc.rpc_salt = None;
		Ok(bc)
	}

	pub fn config_hash(&self) -> String {
		let mut h = std::hash::DefaultHasher::new();
		self.entry.hash(&mut h);
		self.routes.hash(&mut h);
		format!("{:?}", self.output).hash(&mut h);
		self.renderer.hash(&mut h);
		self.obfuscate.hash(&mut h);
		self.sourcemap.hash(&mut h);
		self.type_hint.hash(&mut h);
		self.hash_length.hash(&mut h);
		self.root_id.hash(&mut h);
		self.data_id.hash(&mut h);
		self.pages_dir.hash(&mut h);
		self.is_fullstack.hash(&mut h);
		if let Some(ref i18n) = self.i18n {
			i18n.locales.hash(&mut h);
			i18n.default.hash(&mut h);
			i18n.messages_dir.hash(&mut h);
			i18n.mode.as_str().hash(&mut h);
			i18n.cache.hash(&mut h);
		}
		format!("{:016x}", h.finish())
	}
}

#[cfg(test)]
mod tests;
