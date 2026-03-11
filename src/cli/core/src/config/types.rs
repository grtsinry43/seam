/* src/cli/core/src/config/types.rs */

use std::path::{Path, PathBuf};

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputMode {
	Static,
	Server,
	#[default]
	Hybrid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TransportPreference {
	Http,
	Sse,
	Ws,
	Ipc,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TransportConfig {
	pub prefer: TransportPreference,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub fallback: Option<Vec<TransportPreference>>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct TransportSection {
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub query: Option<TransportConfig>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub command: Option<TransportConfig>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub stream: Option<TransportConfig>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub subscription: Option<TransportConfig>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub upload: Option<TransportConfig>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub channel: Option<TransportConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeamConfig {
	#[serde(default)]
	pub output: OutputMode,
	#[serde(default)]
	pub project: ProjectConfig,
	#[serde(default)]
	pub backend: BackendConfig,
	#[serde(default)]
	pub frontend: FrontendConfig,
	#[serde(default)]
	pub build: BuildSection,
	#[serde(default)]
	pub generate: GenerateSection,
	#[serde(default)]
	pub dev: DevSection,
	#[serde(default)]
	pub i18n: Option<I18nSection>,
	#[serde(default)]
	pub workspace: Option<WorkspaceSection>,
	#[serde(default)]
	pub clean: CleanSection,
	#[serde(default)]
	pub transport: Option<TransportSection>,
	#[serde(default)]
	#[allow(dead_code)] // deserialized for passthrough to bundler scripts via SEAM_CONFIG_PATH
	pub vite: Option<serde_json::Value>,
	#[serde(default)]
	#[allow(dead_code)] // reserved for future router config
	pub router: Option<serde_json::Value>,
	/// Absolute path to the config file (set by loader, not deserialized)
	#[serde(skip)]
	pub config_file_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkspaceSection {
	pub members: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct CleanSection {
	#[serde(default)]
	pub commands: Vec<String>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum I18nMode {
	#[default]
	Memory,
	Paged,
}

impl I18nMode {
	pub fn as_str(self) -> &'static str {
		match self {
			Self::Memory => "memory",
			Self::Paged => "paged",
		}
	}
}

#[derive(Debug, Clone, Deserialize)]
pub struct I18nSection {
	pub locales: Vec<String>,
	#[serde(default = "default_i18n_default")]
	pub default: String,
	#[serde(default = "default_messages_dir")]
	pub messages_dir: String,
	#[serde(default)]
	pub mode: I18nMode,
	#[serde(default)]
	pub cache: bool,
}

impl I18nSection {
	pub fn validate(&self) -> Result<()> {
		if self.locales.is_empty() {
			bail!("i18n.locales must not be empty");
		}
		if !self.locales.contains(&self.default) {
			bail!("i18n.default \"{}\" is not in i18n.locales {:?}", self.default, self.locales);
		}
		Ok(())
	}
}

fn default_i18n_default() -> String {
	"origin".to_string()
}

fn default_messages_dir() -> String {
	"locales".to_string()
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ProjectConfig {
	#[serde(default)]
	pub name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BackendConfig {
	#[serde(default = "default_lang")]
	pub lang: String,
	pub dev_command: Option<CommandConfig>,
	#[serde(default = "default_port")]
	pub port: u16,
}

impl Default for BackendConfig {
	fn default() -> Self {
		Self { lang: default_lang(), dev_command: None, port: default_port() }
	}
}

#[derive(Debug, Clone, Deserialize)]
pub struct FrontendConfig {
	pub entry: Option<String>,
	pub dev_command: Option<CommandConfig>,
	pub dev_port: Option<u16>,
	/// Deprecated: rejected at BuildConfig construction with clear error message
	pub build_command: Option<String>,
	pub out_dir: Option<String>,
	#[serde(default = "default_root_id")]
	pub root_id: String,
	#[serde(default = "default_data_id")]
	pub data_id: String,
}

impl Default for FrontendConfig {
	fn default() -> Self {
		Self {
			entry: None,
			dev_command: None,
			dev_port: None,
			build_command: None,
			out_dir: None,
			root_id: default_root_id(),
			data_id: default_data_id(),
		}
	}
}

fn default_root_id() -> String {
	"__seam".to_string()
}

fn default_data_id() -> String {
	"__data".to_string()
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BuildSection {
	pub routes: Option<String>,
	pub out_dir: Option<String>,
	/// Deprecated: rejected at BuildConfig construction with clear error message
	pub bundler_command: Option<String>,
	/// Deprecated: ignored (built-in bundler always uses .seam/dist/.vite/manifest.json)
	#[allow(dead_code)]
	pub bundler_manifest: Option<String>,
	pub renderer: Option<String>,
	pub backend_build_command: Option<CommandConfig>,
	pub router_file: Option<String>,
	pub manifest_command: Option<CommandConfig>,
	pub typecheck_command: Option<String>,
	#[serde(default)]
	pub obfuscate: Option<bool>,
	#[serde(default)]
	pub sourcemap: Option<bool>,
	#[serde(default)]
	pub type_hint: Option<bool>,
	#[serde(default)]
	pub hash_length: Option<u32>,
	pub pages_dir: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct GenerateSection {
	pub manifest_url: Option<String>,
	pub out_dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum CommandConfig {
	Simple(String),
	WithCwd { command: String, cwd: Option<String> },
}

impl CommandConfig {
	pub fn command(&self) -> &str {
		match self {
			Self::Simple(command) => command,
			Self::WithCwd { command, .. } => command,
		}
	}

	pub fn cwd(&self) -> Option<&str> {
		match self {
			Self::Simple(_) => None,
			Self::WithCwd { cwd, .. } => cwd.as_deref(),
		}
	}

	pub fn resolve_cwd(&self, base_dir: &Path) -> PathBuf {
		match self.cwd() {
			Some(path) => {
				let path = Path::new(path);
				if path.is_absolute() {
					path.to_path_buf()
				} else {
					let joined = base_dir.join(path);
					joined.canonicalize().unwrap_or(joined)
				}
			}
			None => base_dir.to_path_buf(),
		}
	}
}

#[derive(Debug, Clone, Deserialize)]
pub struct DevSection {
	#[serde(default = "default_dev_port")]
	pub port: u16,
	pub vite_port: Option<u16>,
	#[serde(default)]
	pub obfuscate: Option<bool>,
	#[serde(default)]
	pub sourcemap: Option<bool>,
	#[serde(default)]
	pub type_hint: Option<bool>,
	#[serde(default)]
	pub hash_length: Option<u32>,
}

impl Default for DevSection {
	fn default() -> Self {
		Self {
			port: default_dev_port(),
			vite_port: None,
			obfuscate: None,
			sourcemap: None,
			type_hint: None,
			hash_length: None,
		}
	}
}

fn default_dev_port() -> u16 {
	80
}

fn default_lang() -> String {
	"typescript".to_string()
}

fn default_port() -> u16 {
	3000
}

impl SeamConfig {
	pub fn project_name(&self) -> &str {
		self.project.name.as_deref().unwrap_or("")
	}

	pub fn is_workspace(&self) -> bool {
		self.workspace.as_ref().is_some_and(|w| !w.members.is_empty())
	}

	pub fn member_paths(&self) -> &[String] {
		match &self.workspace {
			Some(w) => &w.members,
			None => &[],
		}
	}
}

#[cfg(test)]
mod tests {
	use super::CommandConfig;

	#[test]
	fn resolve_cwd_defaults_to_base_dir() {
		let base_dir = std::env::temp_dir().join("seam-test-command-cwd-default");
		let command = CommandConfig::Simple("bun run dev".to_string());
		assert_eq!(command.resolve_cwd(&base_dir), base_dir);
	}

	#[test]
	fn resolve_cwd_uses_absolute_path_as_is() {
		let base_dir = std::env::temp_dir().join("seam-test-command-cwd-abs-base");
		let abs = std::env::temp_dir().join("seam-test-command-cwd-abs-target");
		let command = CommandConfig::WithCwd {
			command: "bun run dev".to_string(),
			cwd: Some(abs.to_string_lossy().to_string()),
		};
		assert_eq!(command.resolve_cwd(&base_dir), abs);
	}
}
