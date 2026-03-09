/* src/server/core/rust-macros/tests/runtime.rs */
#![allow(clippy::unwrap_used)]

use seam_macros::{SeamType, seam_command, seam_procedure};
use seam_server::{ProcedureType, SeamError, SeamType as _, compile_schema, validate_compiled};
use serde::{Deserialize, Serialize};
use serde_json::json;

// -- Shared types --

#[derive(SeamType, Serialize, Deserialize)]
struct GreetInput {
	name: String,
}

#[derive(SeamType, Serialize, Deserialize)]
struct GreetOutput {
	message: String,
}

#[seam_procedure]
async fn greet(input: GreetInput) -> Result<GreetOutput, SeamError> {
	Ok(GreetOutput { message: format!("Hello, {}!", input.name) })
}

#[tokio::test]
async fn procedure_factory_invoke_handler() {
	let def = greet_procedure();
	assert_eq!(def.name, "greet");
	assert_eq!(def.proc_type, ProcedureType::Query);

	let input = json!({"name": "Alice"});
	let result = (def.handler)(input, json!({})).await.unwrap();
	assert_eq!(result, json!({"message": "Hello, Alice!"}));
}

// -- Command type --

#[derive(SeamType, Serialize, Deserialize)]
struct DeleteInput {
	id: i32,
}

#[derive(SeamType, Serialize, Deserialize)]
struct DeleteOutput {
	deleted: bool,
}

#[seam_command]
async fn remove_item(input: DeleteInput) -> Result<DeleteOutput, SeamError> {
	Ok(DeleteOutput { deleted: input.id > 0 })
}

#[tokio::test]
async fn command_factory_sets_command_type() {
	let def = remove_item_procedure();
	assert_eq!(def.name, "remove_item");
	assert_eq!(def.proc_type, ProcedureType::Command);

	let result = (def.handler)(json!({"id": 5}), json!({})).await.unwrap();
	assert_eq!(result, json!({"deleted": true}));
}

// -- Schema validation roundtrip --

#[derive(SeamType, Serialize, Deserialize)]
struct UserData {
	name: String,
	age: i32,
}

#[test]
fn derive_schema_validates() {
	let schema = UserData::jtd_schema();
	let compiled = compile_schema(&schema).unwrap();

	// Valid data passes
	let valid = json!({"name": "Alice", "age": 30});
	assert!(validate_compiled(&compiled, &valid).is_ok());

	// Missing required field fails
	let invalid = json!({"name": "Alice"});
	assert!(validate_compiled(&compiled, &invalid).is_err());
}

// -- Procedure with context --

#[derive(SeamType, Serialize, Deserialize)]
struct AuthCtx {
	user_id: String,
}

#[derive(SeamType, Serialize, Deserialize)]
struct ProfileInput {
	format: String,
}

#[derive(SeamType, Serialize, Deserialize)]
struct ProfileOutput {
	user_id: String,
	display: String,
}

#[seam_procedure(context = AuthCtx)]
async fn get_profile(input: ProfileInput, ctx: AuthCtx) -> Result<ProfileOutput, SeamError> {
	Ok(ProfileOutput { user_id: ctx.user_id, display: input.format })
}

#[tokio::test]
async fn procedure_with_context() {
	let def = get_profile_procedure();
	assert_eq!(def.context_keys, vec!["user_id"]);

	let input = json!({"format": "short"});
	let ctx = json!({"user_id": "u-42"});
	let result = (def.handler)(input, ctx).await.unwrap();
	assert_eq!(result, json!({"user_id": "u-42", "display": "short"}));
}

// -- Command with error schema --

#[derive(SeamType, Serialize, Deserialize)]
enum AppError {
	NotFound,
	Forbidden,
}

#[seam_command(error = AppError)]
async fn delete_user(_input: DeleteInput) -> Result<DeleteOutput, SeamError> {
	Ok(DeleteOutput { deleted: true })
}

#[test]
fn command_with_error_schema() {
	let def = delete_user_procedure();
	let error_schema = def.error_schema.as_ref().expect("error_schema should be set");
	assert_eq!(*error_schema, AppError::jtd_schema());
	assert_eq!(*error_schema, json!({"enum": ["notfound", "forbidden"]}));
}
