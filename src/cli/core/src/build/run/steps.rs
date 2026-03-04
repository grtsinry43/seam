/* src/cli/core/src/build/run/steps.rs */

// Shared build step helpers: bundler env, skeleton rendering, frontend bundling.
// Extracted from fullstack, frontend, rebuild, and workspace builds.

use std::path::Path;

use anyhow::Result;

use super::super::config::BuildConfig;
use super::super::route::{SkeletonOutput, run_skeleton_renderer};
use super::super::types::{AssetFiles, read_bundle_manifest};
use super::helpers::{print_cache_stats, run_bundler};
use crate::shell::resolve_node_module;
use crate::ui;

pub(crate) type EnvPairs = Vec<(String, String)>;

/// Shared bundler environment variables derived from build config.
/// Returns owned pairs for lifetime independence. Callers may extend
/// with extra entries (e.g. SEAM_ROUTES_FILE) before passing to `bundle_frontend`.
pub(crate) fn build_bundler_env(build_config: &BuildConfig, rpc_map_path: &str) -> EnvPairs {
  vec![
    ("SEAM_OBFUSCATE".into(), if build_config.obfuscate { "1" } else { "0" }.into()),
    ("SEAM_SOURCEMAP".into(), if build_config.sourcemap { "1" } else { "0" }.into()),
    ("SEAM_TYPE_HINT".into(), if build_config.type_hint { "1" } else { "0" }.into()),
    ("SEAM_HASH_LENGTH".into(), build_config.hash_length.to_string()),
    ("SEAM_RPC_MAP_PATH".into(), rpc_map_path.into()),
    ("SEAM_DIST_DIR".into(), build_config.dist_dir().to_string()),
  ]
}

/// Render skeletons via `@canmi/seam-react` build script. Resolves the script
/// from node_modules, invokes the renderer, and prints warnings + cache stats.
pub(crate) fn render_skeletons(
  build_config: &BuildConfig,
  base_dir: &Path,
  manifest_json_path: &Path,
) -> Result<SkeletonOutput> {
  let script_path = resolve_node_module(base_dir, "@canmi/seam-react/scripts/build-skeletons.mjs")
    .ok_or_else(|| anyhow::anyhow!("build-skeletons.mjs not found -- install @canmi/seam-react"))?;
  let routes_path = base_dir.join(&build_config.routes);
  let output = run_skeleton_renderer(
    &script_path,
    &routes_path,
    manifest_json_path,
    base_dir,
    build_config.i18n.as_ref(),
  )?;
  for w in &output.warnings {
    ui::detail_warn(w);
  }
  print_cache_stats(&output.cache);
  Ok(output)
}

/// Run the bundler and parse the resulting asset manifest.
pub(crate) fn bundle_frontend(
  build_config: &BuildConfig,
  base_dir: &Path,
  env: &EnvPairs,
) -> Result<AssetFiles> {
  let dist_dir = build_config.dist_dir().to_string();
  let env_refs: Vec<(&str, &str)> = env.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
  run_bundler(base_dir, &build_config.bundler_mode, &dist_dir, &env_refs)?;
  read_bundle_manifest(&base_dir.join(&build_config.bundler_manifest))
}
