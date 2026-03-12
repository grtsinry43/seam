/* src/cli/core/src/dev/fullstack.rs */

use std::path::Path;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tokio::signal;

use crate::build::config::BuildConfig;
use crate::build::run::{RebuildMode, run_incremental_rebuild};
use crate::config::SeamConfig;
use crate::ui::{self, CYAN, DIM, GREEN, RED, RESET, col};

use super::network::find_available_port;
use super::network::wait_for_port;
use super::process::{ChildProcess, label_color, pipe_output, spawn_binary, spawn_child, wait_any};
use super::ui::print_fullstack_banner;

/// Partial struct for lightweight `_meta` extraction without full deserialization.
#[derive(serde::Deserialize)]
struct ManifestMetaOnly {
	_meta: Option<crate::build::route::ManifestMeta>,
}

#[derive(Clone, Copy, Debug)]
enum DevEvent {
	Reload,
	Rebuild(RebuildMode),
}

struct SpawnOptions {
	port: String,
	out_dir: String,
	public_dir: Option<String>,
	obfuscate: String,
	sourcemap: String,
	vite_port: Option<u16>,
}

/// Returns `None` if the manifest is fresh, or `Some(reason)` explaining why a rebuild is needed.
fn manifest_stale_reason(json: &str, build_config: &BuildConfig) -> Option<String> {
	let wrapper: ManifestMetaOnly = match serde_json::from_str(json) {
		Ok(w) => w,
		Err(_) => return Some("manifest parse failed".to_string()),
	};
	let Some(meta) = wrapper._meta else {
		return Some("legacy manifest without _meta".to_string());
	};
	let current_version = env!("CARGO_PKG_VERSION");
	if meta.seam_version != current_version {
		return Some(format!("seam version changed ({} -> {current_version})", meta.seam_version));
	}
	let current_hash = build_config.config_hash();
	if meta.config_hash != current_hash {
		return Some("config changed since last build".to_string());
	}
	None
}

fn classify_event(event: &notify::Event, server_dir: &Path, public_dir: Option<&Path>) -> DevEvent {
	if event.paths.iter().any(|p| p.starts_with(server_dir)) {
		return DevEvent::Rebuild(RebuildMode::Full);
	}
	if let Some(public_dir) = public_dir
		&& event.paths.iter().any(|p| p.starts_with(public_dir))
	{
		return DevEvent::Reload;
	}
	DevEvent::Rebuild(RebuildMode::FrontendOnly)
}

fn merge_dev_events(current: DevEvent, incoming: DevEvent) -> DevEvent {
	match (current, incoming) {
		(DevEvent::Rebuild(RebuildMode::Full), _) | (_, DevEvent::Rebuild(RebuildMode::Full)) => {
			DevEvent::Rebuild(RebuildMode::Full)
		}
		(DevEvent::Rebuild(RebuildMode::FrontendOnly), _)
		| (_, DevEvent::Rebuild(RebuildMode::FrontendOnly)) => {
			DevEvent::Rebuild(RebuildMode::FrontendOnly)
		}
		_ => DevEvent::Reload,
	}
}

fn setup_watcher(
	server_dir: std::path::PathBuf,
	public_dir: Option<std::path::PathBuf>,
) -> Result<(RecommendedWatcher, tokio::sync::mpsc::Receiver<DevEvent>)> {
	let (tx, rx) = tokio::sync::mpsc::channel(16);
	let watcher = RecommendedWatcher::new(
		move |res: std::result::Result<notify::Event, notify::Error>| {
			if let Ok(event) = res {
				let dev_event = classify_event(&event, &server_dir, public_dir.as_deref());
				let _ = tx.blocking_send(dev_event);
			}
		},
		notify::Config::default(),
	)?;
	// Directories are watched in run_dev_fullstack after watcher creation
	Ok((watcher, rx))
}

fn write_reload_trigger(out_dir: &Path) {
	let trigger = out_dir.join(".reload-trigger");
	let ts = std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.unwrap_or_default()
		.as_millis()
		.to_string();
	let _ = std::fs::write(&trigger, &ts);
}

async fn handle_rebuild(
	config: &SeamConfig,
	build_config: &BuildConfig,
	base_dir: &Path,
	out_dir: &Path,
	is_vite: bool,
	mode: RebuildMode,
) {
	let started = Instant::now();
	let label = match mode {
		RebuildMode::Full => "rebuilding (full)...",
		RebuildMode::FrontendOnly => "rebuilding...",
	};
	ui::label(CYAN, "seam", label);

	let cfg = config.clone();
	let bc = build_config.clone();
	let bd = base_dir.to_path_buf();
	let result =
		tokio::task::spawn_blocking(move || run_incremental_rebuild(&cfg, &bc, &bd, mode)).await;

	match result {
		Ok(Ok(())) => {
			ui::label(
				GREEN,
				"seam",
				&format!("rebuild complete ({:.1}s)", started.elapsed().as_secs_f64()),
			);
			// Skip reload trigger when Vite handles HMR — the trigger would
			// cause seamReloadPlugin to send a redundant full-reload.
			if !is_vite {
				write_reload_trigger(out_dir);
			}
		}
		Ok(Err(e)) => ui::label(RED, "seam", &format!("rebuild error: {e}")),
		Err(e) => ui::label(RED, "seam", &format!("rebuild panicked: {e}")),
	}
}

fn handle_public_reload(out_dir: &Path) {
	ui::label(CYAN, "seam", "public/ changed, reloading...");
	write_reload_trigger(out_dir);
}

async fn spawn_fullstack_children(
	config: &SeamConfig,
	base_dir: &Path,
	opts: &SpawnOptions,
) -> Result<Vec<ChildProcess>> {
	let mut children: Vec<ChildProcess> = Vec::new();

	// Spawn Vite dev server via dev-frontend.mjs when configured
	if let Some(vp) = opts.vite_port {
		let script = crate::shell::find_cli_script(base_dir, "dev-frontend.mjs")?;
		let runtime = if crate::shell::which_exists("bun") { "bun" } else { "node" };
		let runtime_path = std::path::PathBuf::from(runtime);
		let vp_str = vp.to_string();
		let script_str = script.to_string_lossy().to_string();
		let mut env_vars_vite: Vec<(&str, &str)> = Vec::new();
		if let Some(ref cp) = config.config_file_path {
			env_vars_vite.push(("SEAM_CONFIG_PATH", cp));
		}
		let dev_out_dir = base_dir
			.join(config.build.out_dir.clone().unwrap_or_else(|| ".seam/output".into()))
			.parent()
			.unwrap_or(std::path::Path::new("."))
			.join("dev-output")
			.to_string_lossy()
			.to_string();
		env_vars_vite.push(("SEAM_DEV_OUT_DIR", &dev_out_dir));
		let mut proc =
			spawn_binary("vite", &runtime_path, &[&script_str, &vp_str], base_dir, &env_vars_vite)?;
		pipe_output(&mut proc).await;
		children.push(proc);

		ui::label(DIM, "vite", &format!("waiting on :{vp}..."));
		wait_for_port(vp, Duration::from_secs(10)).await?;
		ui::label(GREEN, "vite", "ready");
	}

	let backend_cmd = config
		.backend
		.dev_command
		.as_ref()
		.context("backend.dev_command is required for fullstack dev mode")?;
	let mut env_vars: Vec<(&str, &str)> = vec![
		("PORT", &opts.port),
		("SEAM_DEV", "1"),
		("SEAM_OUTPUT_DIR", &opts.out_dir),
		("SEAM_OBFUSCATE", &opts.obfuscate),
		("SEAM_SOURCEMAP", &opts.sourcemap),
	];
	if let Some(public_dir) = opts.public_dir.as_deref() {
		env_vars.push(("SEAM_PUBLIC_DIR", public_dir));
	}
	if opts.vite_port.is_some() {
		env_vars.push(("SEAM_VITE", "1"));
	}
	let backend_cwd = backend_cmd.resolve_cwd(base_dir);
	let mut proc = spawn_child("backend", backend_cmd.command(), &backend_cwd, &env_vars)?;
	pipe_output(&mut proc).await;
	children.push(proc);

	if let Some(cmd) = config.frontend.dev_command.as_ref() {
		let frontend_cwd = cmd.resolve_cwd(base_dir);
		let mut proc = spawn_child("frontend", cmd.command(), &frontend_cwd, &[])?;
		pipe_output(&mut proc).await;
		children.push(proc);
	}

	Ok(children)
}

fn configure_dev_build(
	config: &SeamConfig,
	base_dir: &Path,
) -> Result<(BuildConfig, std::path::PathBuf)> {
	let mut build_config = BuildConfig::from_seam_config_dev(config)?;
	let dev_dir = std::path::Path::new(&build_config.out_dir)
		.parent()
		.unwrap_or(std::path::Path::new("."))
		.join("dev-output");
	build_config.out_dir = dev_dir.to_string_lossy().to_string();
	if build_config.obfuscate {
		build_config.rpc_salt = Some(seam_codegen::generate_random_salt());
	}
	Ok((build_config, base_dir.join(dev_dir)))
}

fn ensure_initial_dev_build(
	config: &SeamConfig,
	build_config: &BuildConfig,
	base_dir: &Path,
	out_dir: &Path,
) -> Result<()> {
	let route_manifest_path = out_dir.join("route-manifest.json");
	let should_rebuild = match std::fs::read_to_string(&route_manifest_path) {
		Ok(json) => {
			let reason = manifest_stale_reason(&json, build_config);
			if let Some(r) = &reason {
				println!("  {}rebuilding: {r}{}", col(DIM), col(RESET));
			}
			reason.is_some()
		}
		Err(_) => true,
	};
	if should_rebuild {
		crate::build::run::run_dev_build(config, build_config, base_dir)?;
		println!();
		return Ok(());
	}
	println!("  {}route-manifest.json up to date, skipping initial build{}", col(DIM), col(RESET));
	println!("  {}(delete {} to force rebuild){}", col(DIM), out_dir.display(), col(RESET));
	println!();
	Ok(())
}

fn watch_dir(
	watcher: &mut RecommendedWatcher,
	path: &Path,
	label: &str,
	watched_dirs: &mut Vec<String>,
) -> Result<()> {
	if path.exists() {
		watcher.watch(path, RecursiveMode::Recursive)?;
		watched_dirs.push(label.to_string());
	}
	Ok(())
}

fn setup_watched_dirs(
	base_dir: &Path,
	build_config: &BuildConfig,
	public_dir: Option<&Path>,
	watcher: &mut RecommendedWatcher,
) -> Result<Vec<String>> {
	let mut watched_dirs = Vec::new();
	for dir in ["src/client", "src/server", "shared"] {
		watch_dir(watcher, &base_dir.join(dir), &format!("{dir}/"), &mut watched_dirs)?;
	}
	if let Some(pages_dir) = &build_config.pages_dir {
		watch_dir(watcher, &base_dir.join(pages_dir), &format!("{pages_dir}/"), &mut watched_dirs)?;
	}
	if let Some(public_dir) = public_dir {
		watch_dir(watcher, public_dir, "public/", &mut watched_dirs)?;
	}
	Ok(watched_dirs)
}

fn resolve_spawn_options(
	build_config: &BuildConfig,
	base_dir: &Path,
	out_dir: &Path,
	public_dir: Option<&Path>,
	port: u16,
	vite_port: Option<u16>,
) -> Result<SpawnOptions> {
	let abs_out_dir = if out_dir.is_absolute() {
		out_dir.to_path_buf()
	} else {
		base_dir
			.join(out_dir)
			.canonicalize()
			.with_context(|| format!("failed to resolve {}", out_dir.display()))?
	};
	Ok(SpawnOptions {
		port: port.to_string(),
		out_dir: abs_out_dir.to_string_lossy().to_string(),
		public_dir: public_dir.map(|dir| dir.to_string_lossy().to_string()),
		obfuscate: if build_config.obfuscate { "1" } else { "0" }.to_string(),
		sourcemap: if build_config.sourcemap { "1" } else { "0" }.to_string(),
		vite_port,
	})
}

async fn run_dev_event_loop(
	children: &mut [ChildProcess],
	watcher_rx: &mut tokio::sync::mpsc::Receiver<DevEvent>,
	config: &SeamConfig,
	build_config: &BuildConfig,
	base_dir: &Path,
	out_dir: &Path,
	is_vite: bool,
) {
	loop {
		tokio::select! {
			_ = signal::ctrl_c() => {
				println!();
				ui::shutting_down();
				break;
			}
			result = wait_any(children) => {
				let (label, status) = result;
				let color = label_color(label);
				ui::process_exited(label, color, status);
				break;
			}
			Some(initial_event) = watcher_rx.recv() => {
				tokio::time::sleep(Duration::from_millis(300)).await;
				let mut event = initial_event;
				while let Ok(next_event) = watcher_rx.try_recv() {
					event = merge_dev_events(event, next_event);
				}
				match event {
					DevEvent::Reload => handle_public_reload(out_dir),
					DevEvent::Rebuild(mode) => {
						handle_rebuild(config, build_config, base_dir, out_dir, is_vite, mode).await;
					}
				}
			}
		}
	}
}

/// Workspace dev mode: resolve a single member, then run fullstack dev with merged config
pub async fn run_dev_workspace(
	root: &SeamConfig,
	base_dir: &Path,
	member_name: &str,
) -> Result<()> {
	let members = crate::workspace::resolve_members(root, base_dir, Some(member_name))?;
	let member = &members[0];
	run_dev_fullstack(&member.merged_config, base_dir).await
}

pub(super) async fn run_dev_fullstack(config: &SeamConfig, base_dir: &Path) -> Result<()> {
	let (build_config, out_dir) = configure_dev_build(config, base_dir)?;
	ensure_initial_dev_build(config, &build_config, base_dir, &out_dir)?;

	let server_dir = base_dir.join("src/server");
	let public_dir = base_dir.join("public");
	let public_dir = if public_dir.is_dir() { Some(public_dir) } else { None };
	let (mut _watcher, mut watcher_rx) = setup_watcher(server_dir, public_dir.clone())?;
	let watched_dirs =
		setup_watched_dirs(base_dir, &build_config, public_dir.as_deref(), &mut _watcher)?;
	let port = find_available_port(config.dev.port)?;
	let vite_port = config.dev.vite_port;
	let spawn_opts = resolve_spawn_options(
		&build_config,
		base_dir,
		&out_dir,
		public_dir.as_deref(),
		port,
		vite_port,
	)?;
	print_fullstack_banner(config, port, &watched_dirs, vite_port);
	let mut children = spawn_fullstack_children(config, base_dir, &spawn_opts).await?;
	run_dev_event_loop(
		&mut children,
		&mut watcher_rx,
		config,
		&build_config,
		base_dir,
		&out_dir,
		vite_port.is_some(),
	)
	.await;
	Ok(())
}

#[cfg(test)]
mod tests {
	use std::path::PathBuf;

	use super::*;

	fn test_build_config() -> BuildConfig {
		BuildConfig {
			output: crate::config::OutputMode::Hybrid,
			entry: "src/main.tsx".to_string(),
			routes: "./src/routes.ts".to_string(),
			out_dir: ".seam/dev-output".to_string(),
			renderer: "react".to_string(),
			backend_build_command: None,
			router_file: None,
			manifest_command: None,
			typecheck_command: None,
			is_fullstack: false,
			obfuscate: false,
			sourcemap: true,
			type_hint: true,
			hash_length: 12,
			rpc_salt: None,
			root_id: "__SEAM_ROOT__".to_string(),
			data_id: "__data".to_string(),
			pages_dir: None,
			i18n: None,
			config_path: None,
		}
	}

	fn make_manifest_json(version: &str, hash: &str) -> String {
		format!(r#"{{"_meta":{{"seam_version":"{version}","config_hash":"{hash}"}},"routes":{{}}}}"#)
	}

	#[test]
	fn fresh_manifest_matching_meta() {
		let bc = test_build_config();
		let json = make_manifest_json(env!("CARGO_PKG_VERSION"), &bc.config_hash());
		assert!(manifest_stale_reason(&json, &bc).is_none());
	}

	#[test]
	fn stale_manifest_wrong_version() {
		let bc = test_build_config();
		let json = make_manifest_json("0.0.0", &bc.config_hash());
		let reason = manifest_stale_reason(&json, &bc).unwrap();
		assert!(reason.contains("version changed"));
	}

	#[test]
	fn classify_event_marks_public_changes_as_reload() {
		let event = notify::Event {
			kind: notify::EventKind::Modify(notify::event::ModifyKind::Any),
			paths: vec![PathBuf::from("/app/public/images/logo.png")],
			attrs: notify::event::EventAttributes::new(),
		};

		let kind = classify_event(&event, Path::new("/app/src/server"), Some(Path::new("/app/public")));
		assert!(matches!(kind, DevEvent::Reload));
	}

	#[test]
	fn classify_event_marks_server_changes_as_full_rebuild() {
		let event = notify::Event {
			kind: notify::EventKind::Modify(notify::event::ModifyKind::Any),
			paths: vec![PathBuf::from("/app/src/server/index.ts")],
			attrs: notify::event::EventAttributes::new(),
		};

		let kind = classify_event(&event, Path::new("/app/src/server"), Some(Path::new("/app/public")));
		assert!(matches!(kind, DevEvent::Rebuild(RebuildMode::Full)));
	}

	#[test]
	fn merge_dev_events_prefers_rebuild_over_reload() {
		let merged = merge_dev_events(DevEvent::Reload, DevEvent::Rebuild(RebuildMode::FrontendOnly));
		assert!(matches!(merged, DevEvent::Rebuild(RebuildMode::FrontendOnly)));
	}

	#[test]
	fn stale_manifest_wrong_config() {
		let bc = test_build_config();
		let json = make_manifest_json(env!("CARGO_PKG_VERSION"), "0000000000000000");
		let reason = manifest_stale_reason(&json, &bc).unwrap();
		assert!(reason.contains("config changed"));
	}

	#[test]
	fn stale_manifest_no_meta() {
		let bc = test_build_config();
		let json = r#"{"routes":{}}"#;
		let reason = manifest_stale_reason(json, &bc).unwrap();
		assert!(reason.contains("legacy"));
	}

	#[test]
	fn stale_manifest_invalid_json() {
		let bc = test_build_config();
		let json = "not valid json {{{";
		assert!(manifest_stale_reason(json, &bc).is_some());
	}
}
