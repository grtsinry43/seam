/* src/server/adapter/axum/src/lib.rs */
#![cfg_attr(test, allow(clippy::unwrap_used))]

mod error;
mod handler;

use std::sync::Arc;

use seam_server::SeamServer;
use seam_server::manifest::build_manifest;

/// Re-export seam-server core for convenience
pub use seam_server;

/// Extension trait that converts a `SeamServer` into an Axum router.
pub trait IntoAxumRouter {
	fn into_axum_router(self) -> axum::Router;
	fn serve(
		self,
		addr: &str,
	) -> impl std::future::Future<Output = Result<(), Box<dyn std::error::Error>>> + Send;
}

impl IntoAxumRouter for SeamServer {
	fn into_axum_router(self) -> axum::Router {
		let parts = self.into_parts();
		let manifest_json = serde_json::to_value(build_manifest(
			&parts.procedures,
			&parts.subscriptions,
			&parts.streams,
			&parts.uploads,
			parts.channel_metas,
			&parts.context_config,
		))
		.expect("manifest serialization");
		let handlers = parts.procedures.into_iter().map(|p| (p.name.clone(), Arc::new(p))).collect();
		let subscriptions =
			parts.subscriptions.into_iter().map(|s| (s.name.clone(), Arc::new(s))).collect();
		let streams = parts.streams.into_iter().map(|s| (s.name.clone(), Arc::new(s))).collect();
		let uploads = parts.uploads.into_iter().map(|u| (u.name.clone(), Arc::new(u))).collect();
		handler::build_router(
			manifest_json,
			handlers,
			subscriptions,
			streams,
			uploads,
			parts.pages,
			parts.rpc_hash_map,
			parts.i18n_config,
			parts.strategies,
			parts.context_config,
			&parts.validation_mode,
		)
	}

	#[allow(clippy::print_stdout)]
	async fn serve(self, addr: &str) -> Result<(), Box<dyn std::error::Error>> {
		let router = self.into_axum_router();
		let listener = tokio::net::TcpListener::bind(addr).await?;
		let local_addr = listener.local_addr()?;
		println!("Seam Rust backend running on http://localhost:{}", local_addr.port());
		axum::serve(listener, router).await?;
		Ok(())
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use axum::body::Body;
	use axum::http::{Request, StatusCode};
	use http_body_util::BodyExt;
	use seam_server::SeamError;
	use seam_server::procedure::{ProcedureDef, ProcedureType};
	use tower::ServiceExt;

	fn test_router() -> axum::Router {
		let mut server = SeamServer::new();
		server = server.procedure(ProcedureDef {
			name: "greet".into(),
			proc_type: ProcedureType::Query,
			input_schema: serde_json::json!({"properties": {"name": {"type": "string"}}}),
			output_schema: serde_json::json!({"properties": {"message": {"type": "string"}}}),
			error_schema: None,
			context_keys: vec![],
			handler: Arc::new(|input, _ctx| {
				Box::pin(async move {
					let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("World");
					Ok(serde_json::json!({"message": format!("Hello, {}!", name)}))
				})
			}),
		});
		server = server.procedure(ProcedureDef {
			name: "updateName".into(),
			proc_type: ProcedureType::Command,
			input_schema: serde_json::json!({"properties": {"name": {"type": "string"}}}),
			output_schema: serde_json::json!({"properties": {"ok": {"type": "boolean"}}}),
			error_schema: None,
			context_keys: vec![],
			handler: Arc::new(|_input, _ctx| {
				Box::pin(async move { Ok(serde_json::json!({"ok": true})) })
			}),
		});
		server.into_axum_router()
	}

	async fn send_request(
		router: axum::Router,
		method: &str,
		path: &str,
		body: Option<&str>,
	) -> (StatusCode, serde_json::Value) {
		let body_content = body.map(|b| Body::from(b.to_string())).unwrap_or(Body::empty());
		let req = Request::builder()
			.method(method)
			.uri(path)
			.header("content-type", "application/json")
			.body(body_content)
			.unwrap();
		let resp = router.oneshot(req).await.unwrap();
		let status = resp.status();
		let bytes = resp.into_body().collect().await.unwrap().to_bytes();
		let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or(serde_json::json!(null));
		(status, json)
	}

	#[test]
	fn into_axum_router_builds_without_panic() {
		let server = SeamServer::new();
		let _router = server.into_axum_router();
	}

	#[tokio::test]
	async fn manifest_returns_procedures() {
		let router = test_router();
		let (status, json) = send_request(router, "GET", "/_seam/manifest.json", None).await;
		assert_eq!(status, StatusCode::OK);
		assert!(json.get("procedures").is_some(), "manifest must contain 'procedures' key");
	}

	#[tokio::test]
	async fn rpc_valid_call() {
		let router = test_router();
		let (status, json) =
			send_request(router, "POST", "/_seam/procedure/greet", Some(r#"{"name":"Seam"}"#)).await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(json["ok"], true);
		assert_eq!(json["data"]["message"], "Hello, Seam!");
	}

	#[tokio::test]
	async fn rpc_invalid_json() {
		let router = test_router();
		let (status, json) =
			send_request(router, "POST", "/_seam/procedure/greet", Some("not json")).await;
		assert_eq!(status, StatusCode::BAD_REQUEST);
		assert_eq!(json["error"]["code"], "VALIDATION_ERROR");
	}

	#[tokio::test]
	async fn rpc_not_found() {
		let router = test_router();
		let (status, json) = send_request(router, "POST", "/_seam/procedure/unknown", Some("{}")).await;
		assert_eq!(status, StatusCode::NOT_FOUND);
		assert_eq!(json["error"]["code"], "NOT_FOUND");
	}

	#[tokio::test]
	async fn rpc_command_type() {
		let router = test_router();
		let (status, json) =
			send_request(router, "POST", "/_seam/procedure/updateName", Some(r#"{"name":"test"}"#)).await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(json["ok"], true);
		assert_eq!(json["data"]["ok"], true);
	}

	#[tokio::test]
	async fn batch_rpc_mixed() {
		let router = test_router();
		let body = r#"{"calls":[{"procedure":"greet","input":{"name":"A"}},{"procedure":"updateName","input":{"name":"B"}}]}"#;
		let (status, json) = send_request(router, "POST", "/_seam/procedure/_batch", Some(body)).await;
		assert_eq!(status, StatusCode::OK);
		let results = json["data"]["results"].as_array().expect("results must be an array");
		assert_eq!(results.len(), 2);
		assert_eq!(results[0]["data"]["message"], "Hello, A!");
		assert_eq!(results[1]["data"]["ok"], true);
	}

	#[tokio::test]
	async fn batch_invalid_body() {
		let router = test_router();
		let (status, _json) =
			send_request(router, "POST", "/_seam/procedure/_batch", Some("not json")).await;
		assert_eq!(status, StatusCode::BAD_REQUEST);
	}

	#[test]
	fn error_status_mapping() {
		use axum::response::IntoResponse;
		let cases = vec![
			(SeamError::validation("x"), StatusCode::BAD_REQUEST),
			(SeamError::not_found("x"), StatusCode::NOT_FOUND),
			(SeamError::internal("x"), StatusCode::INTERNAL_SERVER_ERROR),
			(SeamError::unauthorized("x"), StatusCode::UNAUTHORIZED),
			(SeamError::forbidden("x"), StatusCode::FORBIDDEN),
			(SeamError::rate_limited("x"), StatusCode::TOO_MANY_REQUESTS),
		];
		for (err, expected) in cases {
			let resp = crate::error::AxumError(err).into_response();
			assert_eq!(resp.status(), expected);
		}
	}

	fn validation_router(mode: seam_server::ValidationMode) -> axum::Router {
		let server = SeamServer::new().validation_mode(mode).procedure(ProcedureDef {
			name: "greet".into(),
			proc_type: ProcedureType::Query,
			input_schema: serde_json::json!({"properties": {"name": {"type": "string"}}}),
			output_schema: serde_json::json!({"properties": {"message": {"type": "string"}}}),
			error_schema: None,
			context_keys: vec![],
			handler: Arc::new(|input, _ctx| {
				Box::pin(async move {
					let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("World");
					Ok(serde_json::json!({"message": format!("Hello, {}!", name)}))
				})
			}),
		});
		server.into_axum_router()
	}

	#[tokio::test]
	async fn validation_rejects_invalid_input() {
		let router = validation_router(seam_server::ValidationMode::Always);
		let (status, json) =
			send_request(router, "POST", "/_seam/procedure/greet", Some(r#"{"name": 42}"#)).await;
		assert_eq!(status, StatusCode::BAD_REQUEST);
		assert_eq!(json["ok"], false);
		assert_eq!(json["error"]["code"], "VALIDATION_ERROR");
		assert!(json["error"]["message"].as_str().unwrap().contains("Input validation failed"));
		let details = json["error"]["details"].as_array().expect("details must be array");
		assert!(!details.is_empty());
		assert_eq!(details[0]["path"], "/name");
		assert_eq!(details[0]["expected"], "string");
	}

	#[tokio::test]
	async fn validation_accepts_valid_input() {
		let router = validation_router(seam_server::ValidationMode::Always);
		let (status, json) =
			send_request(router, "POST", "/_seam/procedure/greet", Some(r#"{"name": "Seam"}"#)).await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(json["ok"], true);
		assert_eq!(json["data"]["message"], "Hello, Seam!");
	}

	#[tokio::test]
	async fn validation_batch_one_invalid() {
		let router = validation_router(seam_server::ValidationMode::Always);
		let body = r#"{"calls":[{"procedure":"greet","input":{"name":42}},{"procedure":"greet","input":{"name":"OK"}}]}"#;
		let (status, json) = send_request(router, "POST", "/_seam/procedure/_batch", Some(body)).await;
		assert_eq!(status, StatusCode::OK);
		let results = json["data"]["results"].as_array().unwrap();
		assert_eq!(results.len(), 2);
		// First call should fail validation
		assert_eq!(results[0]["ok"], false);
		assert_eq!(results[0]["error"]["code"], "VALIDATION_ERROR");
		assert!(results[0]["error"]["details"].as_array().is_some());
		// Second call should succeed
		assert_eq!(results[1]["ok"], true);
	}

	#[tokio::test]
	async fn validation_never_skips() {
		let router = validation_router(seam_server::ValidationMode::Never);
		// Invalid input passes through when validation is disabled
		let (status, json) =
			send_request(router, "POST", "/_seam/procedure/greet", Some(r#"{"name": 42}"#)).await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(json["ok"], true);
	}

	#[tokio::test]
	async fn validation_error_details_shape() {
		let router = validation_router(seam_server::ValidationMode::Always);
		let (_, json) =
			send_request(router, "POST", "/_seam/procedure/greet", Some(r#"{"name": 42}"#)).await;
		// Verify exact shape matches three-端 format
		assert_eq!(json["ok"], false);
		let error = &json["error"];
		assert_eq!(error["code"], "VALIDATION_ERROR");
		assert_eq!(error["transient"], false);
		let details = error["details"].as_array().unwrap();
		let detail = &details[0];
		assert!(detail.get("path").is_some());
		assert!(detail.get("expected").is_some());
		assert!(detail.get("actual").is_some());
	}

	// -- Stream tests --

	fn stream_router() -> axum::Router {
		use seam_server::procedure::{BoxStream, StreamDef};

		let server = SeamServer::new().stream(StreamDef {
			name: "countStream".into(),
			input_schema: serde_json::json!({"properties": {"n": {"type": "int32"}}}),
			chunk_output_schema: serde_json::json!({"properties": {"value": {"type": "int32"}}}),
			error_schema: None,
			context_keys: vec![],
			handler: Arc::new(|input, _ctx| {
				Box::pin(async move {
					let n = input.get("n").and_then(serde_json::Value::as_i64).unwrap_or(3) as usize;
					let stream: BoxStream<Result<serde_json::Value, SeamError>> = Box::pin(
						futures_util::stream::iter((0..n).map(|i| Ok(serde_json::json!({"value": i})))),
					);
					Ok(stream)
				})
			}),
		});
		server.into_axum_router()
	}

	async fn send_raw_request(router: axum::Router, req: Request<Body>) -> (StatusCode, String) {
		let resp = router.oneshot(req).await.unwrap();
		let status = resp.status();
		let bytes = resp.into_body().collect().await.unwrap().to_bytes();
		(status, String::from_utf8_lossy(&bytes).to_string())
	}

	#[tokio::test]
	async fn stream_returns_sse_with_ids() {
		let router = stream_router();
		let req = Request::builder()
			.method("POST")
			.uri("/_seam/procedure/countStream")
			.header("content-type", "application/json")
			.body(Body::from(r#"{"n": 3}"#))
			.unwrap();
		let (status, body) = send_raw_request(router, req).await;
		assert_eq!(status, StatusCode::OK);
		// Verify SSE data events have incrementing ids
		assert!(body.contains("event: data\nid: 0\n"), "missing id: 0 in:\n{body}");
		assert!(body.contains("event: data\nid: 1\n"), "missing id: 1 in:\n{body}");
		assert!(body.contains("event: data\nid: 2\n"), "missing id: 2 in:\n{body}");
		assert!(body.contains("event: complete\n"), "missing complete event");
	}

	#[tokio::test]
	async fn stream_complete_event() {
		let router = stream_router();
		let req = Request::builder()
			.method("POST")
			.uri("/_seam/procedure/countStream")
			.header("content-type", "application/json")
			.body(Body::from(r#"{"n": 0}"#))
			.unwrap();
		let (status, body) = send_raw_request(router, req).await;
		assert_eq!(status, StatusCode::OK);
		// Empty stream should just have complete event
		assert!(body.contains("event: complete\n"));
		assert!(!body.contains("event: data\n"));
	}

	#[tokio::test]
	async fn stream_validation_error() {
		use seam_server::procedure::{BoxStream, StreamDef};

		let server =
			SeamServer::new().validation_mode(seam_server::ValidationMode::Always).stream(StreamDef {
				name: "typedStream".into(),
				input_schema: serde_json::json!({"properties": {"n": {"type": "int32"}}}),
				chunk_output_schema: serde_json::json!({}),
				error_schema: None,
				context_keys: vec![],
				handler: Arc::new(|_input, _ctx| {
					Box::pin(async move {
						let stream: BoxStream<Result<serde_json::Value, SeamError>> =
							Box::pin(futures_util::stream::empty());
						Ok(stream)
					})
				}),
			});
		let router = server.into_axum_router();
		let req = Request::builder()
			.method("POST")
			.uri("/_seam/procedure/typedStream")
			.header("content-type", "application/json")
			.body(Body::from(r#"{"n": "not a number"}"#))
			.unwrap();
		let (status, body) = send_raw_request(router, req).await;
		assert_eq!(status, StatusCode::OK); // SSE always returns 200, error is in the stream
		assert!(body.contains("event: error\n"));
		assert!(body.contains("VALIDATION_ERROR"));
	}

	#[tokio::test]
	async fn manifest_stream_chunk_output() {
		let router = stream_router();
		let (status, json) = send_request(router, "GET", "/_seam/manifest.json", None).await;
		assert_eq!(status, StatusCode::OK);
		let stream_entry = &json["procedures"]["countStream"];
		assert_eq!(stream_entry["kind"], "stream");
		assert!(stream_entry["chunkOutput"].is_object());
		assert!(stream_entry.get("output").is_none());
	}

	// -- Upload tests --

	fn upload_router() -> axum::Router {
		use seam_server::procedure::UploadDef;

		let server = SeamServer::new().upload(UploadDef {
			name: "echoUpload".into(),
			input_schema: serde_json::json!({}),
			output_schema: serde_json::json!({"properties": {"size": {"type": "int32"}, "filename": {"type": "string"}}}),
			error_schema: None,
			context_keys: vec![],
			handler: Arc::new(|_input, file, _ctx| {
				Box::pin(async move {
					Ok(serde_json::json!({
						"size": file.data.len(),
						"filename": file.name.unwrap_or_default()
					}))
				})
			}),
		});
		server.into_axum_router()
	}

	fn build_multipart_body(
		metadata: &str,
		file_content: &[u8],
		filename: &str,
	) -> (String, Vec<u8>) {
		let boundary = "----SeamTestBoundary";
		let mut body = Vec::new();

		// metadata field
		body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
		body.extend_from_slice(b"Content-Disposition: form-data; name=\"metadata\"\r\n\r\n");
		body.extend_from_slice(metadata.as_bytes());
		body.extend_from_slice(b"\r\n");

		// file field
		body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
		body.extend_from_slice(
			format!("Content-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n")
				.as_bytes(),
		);
		body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
		body.extend_from_slice(file_content);
		body.extend_from_slice(b"\r\n");

		// final boundary
		body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());

		let content_type = format!("multipart/form-data; boundary={boundary}");
		(content_type, body)
	}

	#[tokio::test]
	async fn upload_returns_json() {
		let router = upload_router();
		let (content_type, body) = build_multipart_body("{}", b"hello world", "test.txt");
		let req = Request::builder()
			.method("POST")
			.uri("/_seam/procedure/echoUpload")
			.header("content-type", content_type)
			.body(Body::from(body))
			.unwrap();
		let resp = router.oneshot(req).await.unwrap();
		let status = resp.status();
		let bytes = resp.into_body().collect().await.unwrap().to_bytes();
		let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
		assert_eq!(status, StatusCode::OK);
		assert_eq!(json["ok"], true);
		assert_eq!(json["data"]["size"], 11);
		assert_eq!(json["data"]["filename"], "test.txt");
	}

	#[tokio::test]
	async fn upload_missing_file_400() {
		let router = upload_router();
		// Send multipart with only metadata, no file
		let boundary = "----SeamTestBoundary";
		let mut body = Vec::new();
		body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
		body.extend_from_slice(b"Content-Disposition: form-data; name=\"metadata\"\r\n\r\n{}\r\n");
		body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());

		let req = Request::builder()
			.method("POST")
			.uri("/_seam/procedure/echoUpload")
			.header("content-type", format!("multipart/form-data; boundary={boundary}"))
			.body(Body::from(body))
			.unwrap();
		let resp = router.oneshot(req).await.unwrap();
		let status = resp.status();
		let bytes = resp.into_body().collect().await.unwrap().to_bytes();
		let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
		assert_eq!(status, StatusCode::BAD_REQUEST);
		assert_eq!(json["error"]["code"], "VALIDATION_ERROR");
	}

	#[tokio::test]
	async fn manifest_upload_output() {
		let router = upload_router();
		let (status, json) = send_request(router, "GET", "/_seam/manifest.json", None).await;
		assert_eq!(status, StatusCode::OK);
		let upload_entry = &json["procedures"]["echoUpload"];
		assert_eq!(upload_entry["kind"], "upload");
		assert!(upload_entry["output"].is_object());
		assert!(upload_entry.get("chunkOutput").is_none());
	}
}
