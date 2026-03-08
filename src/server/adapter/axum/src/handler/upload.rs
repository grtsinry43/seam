/* src/server/adapter/axum/src/handler/upload.rs */

use axum::body::Bytes;
use axum::response::{IntoResponse, Response};
use seam_server::{SeamError, SeamFileHandle};

use super::{AppState, resolve_ctx_for_proc};
use crate::error::AxumError;

/// Handles an upload procedure — parses multipart/form-data from raw body bytes.
pub(super) async fn handle_upload_inner(
	state: &AppState,
	name: &str,
	headers: &axum::http::HeaderMap,
	body: Bytes,
) -> Result<Response, AxumError> {
	let upload = state
		.uploads
		.get(name)
		.ok_or_else(|| SeamError::not_found(format!("Upload procedure '{name}' not found")))?;

	// Extract boundary from Content-Type header
	let boundary = headers
		.get(axum::http::header::CONTENT_TYPE)
		.and_then(|ct| ct.to_str().ok())
		.and_then(|ct| multer::parse_boundary(ct).ok())
		.ok_or_else(|| SeamError::validation("Missing or invalid Content-Type for multipart upload"))?;

	let mut multipart = multer::Multipart::new(
		futures_util::stream::once(async move { Ok::<_, std::io::Error>(body) }),
		boundary,
	);

	let mut metadata: Option<serde_json::Value> = None;
	let mut file_handle: Option<SeamFileHandle> = None;

	while let Some(field) = multipart
		.next_field()
		.await
		.map_err(|e| SeamError::validation(format!("Multipart parse error: {e}")))?
	{
		let field_name = field.name().unwrap_or("").to_string();
		match field_name.as_str() {
			"metadata" => {
				let text = field
					.text()
					.await
					.map_err(|e| SeamError::validation(format!("Failed to read metadata: {e}")))?;
				let value: serde_json::Value = serde_json::from_str(&text)
					.map_err(|e| SeamError::validation(format!("Invalid JSON in metadata: {e}")))?;
				metadata = Some(value);
			}
			"file" => {
				let file_name = field.file_name().map(String::from);
				let content_type = field.content_type().map(ToString::to_string);
				let data = field
					.bytes()
					.await
					.map_err(|e| SeamError::validation(format!("Failed to read file: {e}")))?;
				file_handle = Some(SeamFileHandle { name: file_name, content_type, data });
			}
			_ => {}
		}
	}

	let input = metadata.unwrap_or(serde_json::json!({}));
	let file =
		file_handle.ok_or_else(|| SeamError::validation("Missing 'file' field in multipart form"))?;

	if state.should_validate
		&& let Some(cs) = state.compiled_upload_input_schemas.get(name)
		&& let Err((msg, details)) = seam_server::validate_compiled(cs, &input)
	{
		let detail_json = details.iter().map(seam_server::ValidationDetail::to_json).collect();
		return Err(
			SeamError::validation_detailed(
				format!("Input validation failed for upload '{name}': {msg}"),
				detail_json,
			)
			.into(),
		);
	}

	let ctx = resolve_ctx_for_proc(state, &upload.context_keys, headers)?;
	let result = (upload.handler)(input, file, ctx).await?;
	Ok(axum::Json(serde_json::json!({"ok": true, "data": result})).into_response())
}
