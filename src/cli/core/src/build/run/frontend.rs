/* src/cli/core/src/build/run/frontend.rs */

use std::path::Path;
use std::time::Instant;

use anyhow::Result;

use super::super::config::BuildConfig;
use super::super::route::{BundleContext, RenderContext, print_asset_files};
use super::super::types::read_bundle_manifest_extended;
use super::helpers;
use super::steps;
use crate::ui::{self, BRIGHT_CYAN, BRIGHT_GREEN, RESET, StepTracker, col};

// -- Step registry --

fn frontend_steps(build_config: &BuildConfig, has_ssg: bool) -> Vec<&'static str> {
	let mut steps = Vec::new();
	if build_config.pages_dir.is_some() {
		steps.push("Generating routes");
	}
	steps.extend(["Bundling frontend", "Rendering skeletons", "Processing routes"]);
	if build_config.i18n.is_some() {
		steps.push("Exporting i18n");
	}
	if has_ssg {
		steps.push("Pre-rendering static pages");
	}
	steps
}

// -- Frontend-only build --

pub(super) fn run_frontend_build(build_config: &BuildConfig, base_dir: &Path) -> Result<()> {
	let started = Instant::now();

	ui::banner("build", None);

	use crate::config::OutputMode;
	let has_ssg = matches!(build_config.output, OutputMode::Static | OutputMode::Hybrid);
	let mut tracker = StepTracker::new(frontend_steps(build_config, has_ssg));

	// -- Generating routes (conditional) --
	if let Some(pages_dir) = &build_config.pages_dir {
		let t = tracker.begin();
		let output = base_dir.join(".seam/generated/routes.ts");
		helpers::run_fs_router(base_dir, pages_dir, &output)?;
		tracker.end(t);
	}

	// -- Bundling frontend --
	let t = tracker.begin();
	let mut bundler_env = steps::build_bundler_env(build_config, "");
	bundler_env.push((
		"SEAM_ROUTES_FILE".into(),
		base_dir.join(&build_config.routes).to_string_lossy().to_string(),
	));
	let manifest_path = base_dir.join(build_config.bundler_manifest());
	let assets = steps::bundle_frontend(build_config, base_dir, &bundler_env)?;
	print_asset_files(base_dir, build_config.dist_dir(), &assets);
	tracker.end_with(t, &format!("{} files", assets.js.len() + assets.css.len()));

	// -- Rendering skeletons --
	let t = tracker.begin();
	let skeleton_output = steps::render_skeletons(build_config, base_dir, Path::new("none"))?;
	ui::detail_ok(&format!("{} routes found", skeleton_output.routes.len()));
	tracker.end_with(t, &format!("{} routes", skeleton_output.routes.len()));

	// -- Processing routes + Exporting i18n --
	let out_dir = base_dir.join(&build_config.out_dir);
	// When sourceFileMap is available, parse extended manifest for per-page splitting.
	let bundle_manifest = if skeleton_output.source_file_map.is_some() {
		read_bundle_manifest_extended(&manifest_path).ok()
	} else {
		None
	};
	let template_assets = match &bundle_manifest {
		Some(bm) => &bm.template,
		None => &assets,
	};
	let render = RenderContext {
		root_id: &build_config.root_id,
		data_id: &build_config.data_id,
		dev_mode: false,
		vite: None,
	};
	let bundle_ctx = BundleContext {
		manifest: bundle_manifest.as_ref(),
		source_file_map: skeleton_output.source_file_map.as_ref(),
	};
	steps::execute_route_steps(
		&steps::RouteStepInput {
			skeleton: &skeleton_output,
			base_dir,
			out_dir: &out_dir,
			assets: template_assets,
			render: &render,
			bundle: &bundle_ctx,
			build_config,
			ref_graph: None,
		},
		&mut tracker,
	)?;

	// -- Pre-rendering static pages (conditional) --
	let ssg_result = if has_ssg && steps::has_prerender_routes(&skeleton_output, build_config.output)
	{
		let t = tracker.begin();
		let ssg = steps::render_static_pages(build_config, base_dir, &out_dir)?;
		tracker.end_with(t, &format!("{} pages", ssg.pages));
		Some(ssg)
	} else if has_ssg {
		let t = tracker.begin();
		tracker.end_with(t, "0 pages");
		None
	} else {
		None
	};
	let ssg_count = ssg_result.as_ref().map_or(0, |s| s.pages);

	// Package SSG output for full static deployment
	if let Some(ref ssg) = ssg_result
		&& build_config.output == crate::config::OutputMode::Static
	{
		steps::package_ssg_output(base_dir, ssg, build_config.dist_dir())?;
	}

	// Summary
	ui::blank();
	let elapsed = started.elapsed().as_secs_f64();
	let template_count = skeleton_output.routes.len();
	let asset_count = assets.js.len() + assets.css.len();
	let (bg, bc, r) = (col(BRIGHT_GREEN), col(BRIGHT_CYAN), col(RESET));
	ui::ok(&format!("build complete in {bc}{elapsed:.1}s{r}"));
	let is_static = build_config.output == crate::config::OutputMode::Static;
	if ssg_count > 0 {
		let suffix = if is_static { " \u{00b7} static output" } else { "" };
		ui::detail(&format!(
			"{bg}{template_count}{r} templates \u{00b7} {bg}{ssg_count}{r} prerendered \u{00b7} {bg}{asset_count}{r} assets \u{00b7} {}{suffix}",
			build_config.renderer,
		));
	} else {
		ui::detail(&format!(
			"{bg}{template_count}{r} templates \u{00b7} {bg}{asset_count}{r} assets \u{00b7} {}",
			build_config.renderer,
		));
	}

	Ok(())
}
