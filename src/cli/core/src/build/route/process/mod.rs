/* src/cli/core/src/build/route/process/mod.rs */

mod assets;
mod i18n_export;
mod skeleton;

pub(crate) use i18n_export::export_i18n;
pub(crate) use skeleton::run_skeleton_renderer;

use std::collections::BTreeMap;
use std::path::Path;

use anyhow::{Context, Result};

use super::helpers::path_to_filename;
use super::types::{
  I18nManifest, LayoutManifestEntry, RouteManifest, RouteManifestEntry, SkeletonLayout,
  SkeletonRoute,
};
use crate::build::types::{AssetFiles, BundleManifest, ViteDevInfo};
use crate::config::I18nSection;
use crate::ui::{self, DIM, RESET, col};
use assets::compute_route_assets;
use seam_skeleton::{ctr_check, extract_head_metadata, extract_template, sentinel_to_slots};
use seam_skeleton::{slot_warning, wrap_document};

#[allow(clippy::too_many_arguments, clippy::too_many_lines)]
pub(crate) fn process_routes(
  layouts: &[SkeletonLayout],
  routes: &[SkeletonRoute],
  templates_dir: &Path,
  assets: &AssetFiles,
  dev_mode: bool,
  vite: Option<&ViteDevInfo>,
  root_id: &str,
  data_id: &str,
  i18n: Option<&I18nSection>,
  bundle_manifest: Option<&BundleManifest>,
  source_file_map: Option<&BTreeMap<String, String>>,
) -> Result<RouteManifest> {
  let manifest_data_id = if data_id == "__data" { None } else { Some(data_id.to_string()) };
  let i18n_manifest = i18n.map(|cfg| I18nManifest {
    locales: cfg.locales.clone(),
    default: cfg.default.clone(),
    mode: cfg.mode.as_str().to_string(),
    cache: cfg.cache,
    route_hashes: BTreeMap::new(),
    content_hashes: BTreeMap::new(),
  });
  let mut manifest = RouteManifest {
    layouts: BTreeMap::new(),
    routes: BTreeMap::new(),
    data_id: manifest_data_id,
    i18n: i18n_manifest,
  };

  // Process layouts
  for layout in layouts {
    let is_root = layout.parent.is_none();
    if let Some(ref locale_html) = layout.locale_html {
      // i18n ON: write per-locale templates
      let mut templates = BTreeMap::new();
      for (locale, html) in locale_html {
        let html = html.replace("<seam-outlet></seam-outlet>", "<!--seam:outlet-->");
        let html = sentinel_to_slots(&html);
        // Only root layouts get full document wrapping; child layouts stay as fragments
        let document = if is_root {
          wrap_document(&html, &assets.css, &assets.js, dev_mode, vite, root_id)
        } else {
          html
        };
        let locale_dir = templates_dir.join(locale);
        std::fs::create_dir_all(&locale_dir)
          .with_context(|| format!("failed to create {}", locale_dir.display()))?;
        let filename = format!("{}.html", layout.id);
        let filepath = locale_dir.join(&filename);
        std::fs::write(&filepath, &document)
          .with_context(|| format!("failed to write {}", filepath.display()))?;
        let template_rel = format!("templates/{locale}/{filename}");
        templates.insert(locale.clone(), template_rel);
      }
      ui::detail_ok(&format!(
        "layout {} {}-> {} locales{}",
        layout.id,
        col(DIM),
        locale_html.len(),
        col(RESET)
      ));
      manifest.layouts.insert(
        layout.id.clone(),
        LayoutManifestEntry {
          template: None,
          templates: Some(templates),
          loaders: layout.loaders.clone(),
          parent: layout.parent.clone(),
          i18n_keys: layout.i18n_keys.clone(),
        },
      );
    } else if let Some(ref html) = layout.html {
      // i18n OFF: single template (original behavior)
      let html = html.replace("<seam-outlet></seam-outlet>", "<!--seam:outlet-->");
      let html = sentinel_to_slots(&html);
      // Only root layouts get full document wrapping; child layouts stay as fragments
      let document = if is_root {
        wrap_document(&html, &assets.css, &assets.js, dev_mode, vite, root_id)
      } else {
        html
      };
      let filename = format!("{}.html", layout.id);
      let filepath = templates_dir.join(&filename);
      std::fs::write(&filepath, &document)
        .with_context(|| format!("failed to write {}", filepath.display()))?;
      let template_rel = format!("templates/{filename}");
      ui::detail_ok(&format!("layout {} {}-> {template_rel}{}", layout.id, col(DIM), col(RESET)));
      manifest.layouts.insert(
        layout.id.clone(),
        LayoutManifestEntry {
          template: Some(template_rel),
          templates: None,
          loaders: layout.loaders.clone(),
          parent: layout.parent.clone(),
          i18n_keys: layout.i18n_keys.clone(),
        },
      );
    }
  }

  // Process routes
  for route in routes {
    if let Some(ref locale_variants) = route.locale_variants {
      // i18n ON: write per-locale templates
      let mut templates = BTreeMap::new();
      for (locale, data) in locale_variants {
        let processed: Vec<_> = data.variants.iter().map(|v| sentinel_to_slots(&v.html)).collect();
        let template = extract_template(&data.axes, &processed);

        ctr_check::verify_ctr_equivalence(
          &route.path,
          &data.mock_html,
          &template,
          &route.mock,
          data_id,
        )?;

        if let Some(schema) = &route.page_schema {
          for w in slot_warning::check_slot_types(&template, schema) {
            ui::detail_warn(&format!("{} [{locale}] {w}", route.path));
          }
        }

        let (document, head_meta) = if route.layout.is_some() {
          if dev_mode {
            (template.clone(), None)
          } else {
            let (meta, body) = extract_head_metadata(&template);
            let hm = if meta.is_empty() { None } else { Some(meta.to_string()) };
            (body.to_string(), hm)
          }
        } else {
          let doc = wrap_document(&template, &assets.css, &assets.js, dev_mode, vite, root_id);
          (doc, None)
        };

        let locale_dir = templates_dir.join(locale);
        std::fs::create_dir_all(&locale_dir)
          .with_context(|| format!("failed to create {}", locale_dir.display()))?;
        let filename = path_to_filename(&route.path);
        let filepath = locale_dir.join(&filename);
        std::fs::write(&filepath, &document)
          .with_context(|| format!("failed to write {}", filepath.display()))?;

        let template_rel = format!("templates/{locale}/{filename}");
        templates.insert(locale.clone(), template_rel);

        // Store head_meta from the default locale only
        if i18n.is_some_and(|cfg| locale == &cfg.default) {
          let assets = compute_route_assets(&route.path, source_file_map, bundle_manifest);
          manifest.routes.entry(route.path.clone()).or_insert_with(|| RouteManifestEntry {
            template: None,
            templates: None,
            layout: route.layout.clone(),
            loaders: route.loaders.clone(),
            head_meta,
            i18n_keys: route.i18n_keys.clone(),
            assets,
          });
        }
      }

      let size = locale_variants.values().next().map(|d| d.mock_html.len() as u64).unwrap_or(0);
      ui::detail_ok(&format!(
        "{}  {}\u{2192} {} locales  (~{}){}",
        route.path,
        col(DIM),
        locale_variants.len(),
        ui::format_size(size),
        col(RESET)
      ));

      // Update the entry with templates map
      if let Some(entry) = manifest.routes.get_mut(&route.path) {
        entry.templates = Some(templates);
      } else {
        let assets = compute_route_assets(&route.path, source_file_map, bundle_manifest);
        manifest.routes.insert(
          route.path.clone(),
          RouteManifestEntry {
            template: None,
            templates: Some(templates),
            layout: route.layout.clone(),
            loaders: route.loaders.clone(),
            head_meta: None,
            i18n_keys: route.i18n_keys.clone(),
            assets,
          },
        );
      }
    } else {
      // i18n OFF: original behavior
      let axes = route.axes.as_ref().expect("axes required when i18n is off");
      let variants = route.variants.as_ref().expect("variants required when i18n is off");
      let mock_html = route.mock_html.as_ref().expect("mock_html required when i18n is off");

      let processed: Vec<_> = variants.iter().map(|v| sentinel_to_slots(&v.html)).collect();
      let template = extract_template(axes, &processed);

      ctr_check::verify_ctr_equivalence(&route.path, mock_html, &template, &route.mock, data_id)?;

      if let Some(schema) = &route.page_schema {
        for w in slot_warning::check_slot_types(&template, schema) {
          ui::detail_warn(&format!("{} {w}", route.path));
        }
      }

      let (document, head_meta) = if route.layout.is_some() {
        if dev_mode {
          (template.clone(), None)
        } else {
          let (meta, body) = extract_head_metadata(&template);
          let hm = if meta.is_empty() { None } else { Some(meta.to_string()) };
          (body.to_string(), hm)
        }
      } else {
        (wrap_document(&template, &assets.css, &assets.js, dev_mode, vite, root_id), None)
      };

      let filename = path_to_filename(&route.path);
      let filepath = templates_dir.join(&filename);
      std::fs::write(&filepath, &document)
        .with_context(|| format!("failed to write {}", filepath.display()))?;

      let size = document.len() as u64;
      let template_rel = format!("templates/{filename}");
      ui::detail_ok(&format!(
        "{}  {}\u{2192} {template_rel}  ({}){}",
        route.path,
        col(DIM),
        ui::format_size(size),
        col(RESET)
      ));

      let assets = compute_route_assets(&route.path, source_file_map, bundle_manifest);
      manifest.routes.insert(
        route.path.clone(),
        RouteManifestEntry {
          template: Some(template_rel),
          templates: None,
          layout: route.layout.clone(),
          loaders: route.loaders.clone(),
          head_meta,
          i18n_keys: route.i18n_keys.clone(),
          assets,
        },
      );
    }
  }
  Ok(manifest)
}
