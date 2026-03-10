/* src/cli/core/src/build/route/tests/packaging.rs */

use super::super::manifest::{package_public_files, package_static_assets};

#[test]
fn package_static_assets_copies_all_files() {
	let tmp = tempfile::tempdir().unwrap();
	let base = tmp.path();

	// Create dist/ with assets and a .vite/ directory that should be skipped
	let assets_dir = base.join("dist/assets");
	std::fs::create_dir_all(&assets_dir).unwrap();
	std::fs::write(assets_dir.join("main-abc.js"), "// main").unwrap();
	std::fs::write(assets_dir.join("chunk-xyz.js"), "// shared chunk").unwrap();
	std::fs::write(assets_dir.join("routes-def.js"), "// dynamic entry").unwrap();
	std::fs::write(assets_dir.join("main-abc.css"), "body{}").unwrap();

	let vite_dir = base.join("dist/.vite");
	std::fs::create_dir_all(&vite_dir).unwrap();
	std::fs::write(vite_dir.join("manifest.json"), "{}").unwrap();

	let out_dir = base.join("output");
	let count = package_static_assets(base, &out_dir, "dist").unwrap();

	assert_eq!(count, 4);

	let public_assets = out_dir.join("public/assets");
	assert!(public_assets.join("main-abc.js").exists());
	assert!(public_assets.join("chunk-xyz.js").exists());
	assert!(public_assets.join("routes-def.js").exists());
	assert!(public_assets.join("main-abc.css").exists());

	// .vite/ must NOT be copied
	assert!(!out_dir.join("public/.vite").exists());
}

#[test]
fn package_static_assets_handles_flat_layout() {
	let tmp = tempfile::tempdir().unwrap();
	let base = tmp.path();

	// Obfuscated build: files at root level, no assets/ subdir
	let dist = base.join("dist");
	std::fs::create_dir_all(&dist).unwrap();
	std::fs::write(dist.join("abc123.js"), "// js").unwrap();
	std::fs::write(dist.join("def456.css"), "/* css */").unwrap();

	let vite_dir = dist.join(".vite");
	std::fs::create_dir_all(&vite_dir).unwrap();
	std::fs::write(vite_dir.join("manifest.json"), "{}").unwrap();

	let out_dir = base.join("output");
	let count = package_static_assets(base, &out_dir, "dist").unwrap();

	assert_eq!(count, 2);

	let public = out_dir.join("public");
	assert!(public.join("abc123.js").exists());
	assert!(public.join("def456.css").exists());
	assert!(!public.join(".vite").exists());
}

#[test]
fn package_static_assets_missing_dist_returns_zero() {
	let tmp = tempfile::tempdir().unwrap();
	let base = tmp.path();
	let out_dir = base.join("output");

	let count = package_static_assets(base, &out_dir, "dist").unwrap();
	assert_eq!(count, 0);
}

#[test]
fn package_public_files_copies_all_files() {
	let tmp = tempfile::tempdir().unwrap();
	let base = tmp.path();

	let public = base.join("public");
	std::fs::create_dir_all(public.join("images")).unwrap();
	std::fs::write(public.join("favicon.svg"), "<svg/>").unwrap();
	std::fs::write(public.join("robots.txt"), "User-agent: *").unwrap();
	std::fs::write(public.join("images/logo.png"), "fake png").unwrap();

	let out_dir = base.join("output");
	let count = package_public_files(base, &out_dir).unwrap();

	assert_eq!(count, 3);
	assert!(out_dir.join("public-root/favicon.svg").exists());
	assert!(out_dir.join("public-root/robots.txt").exists());
	assert!(out_dir.join("public-root/images/logo.png").exists());
}

#[test]
fn package_public_files_returns_zero_when_missing() {
	let tmp = tempfile::tempdir().unwrap();
	let base = tmp.path();
	let out_dir = base.join("output");

	let count = package_public_files(base, &out_dir).unwrap();
	assert_eq!(count, 0);
}

#[test]
fn package_public_files_does_not_collide_with_static_assets() {
	let tmp = tempfile::tempdir().unwrap();
	let base = tmp.path();

	// Create both public/ and dist/
	let public = base.join("public");
	std::fs::create_dir_all(&public).unwrap();
	std::fs::write(public.join("favicon.ico"), "icon").unwrap();

	let dist = base.join("dist");
	std::fs::create_dir_all(&dist).unwrap();
	std::fs::write(dist.join("main.js"), "// js").unwrap();

	let out_dir = base.join("output");
	let pub_count = package_public_files(base, &out_dir).unwrap();
	let asset_count = package_static_assets(base, &out_dir, "dist").unwrap();

	assert_eq!(pub_count, 1);
	assert_eq!(asset_count, 1);

	// Outputs are in separate directories
	assert!(out_dir.join("public-root/favicon.ico").exists());
	assert!(out_dir.join("public/main.js").exists());
}
