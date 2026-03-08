/* src/server/core/rust/src/validation.rs */

use serde_json::{Map, Value};
use std::env;

/// Controls when input validation runs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationMode {
	/// Validate only in dev mode (default).
	Dev,
	/// Always validate.
	Always,
	/// Never validate.
	Never,
}

/// Check whether validation should run for the given mode.
pub fn should_validate(mode: &ValidationMode) -> bool {
	match mode {
		ValidationMode::Never => false,
		ValidationMode::Always => true,
		ValidationMode::Dev => {
			if let Ok(v) = env::var("SEAM_ENV") {
				return v != "production";
			}
			if let Ok(v) = env::var("NODE_ENV") {
				return v != "production";
			}
			true
		}
	}
}

/// JTD primitive type identifiers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JtdType {
	Boolean,
	String,
	Timestamp,
	Int8,
	Int16,
	Int32,
	Uint8,
	Uint16,
	Uint32,
	Float32,
	Float64,
}

/// Pre-compiled JTD schema for fast repeated validation.
#[derive(Debug, Clone)]
pub enum CompiledSchema {
	Empty,
	Type(JtdType),
	Enum(Vec<String>),
	Elements(Box<CompiledSchema>),
	Values(Box<CompiledSchema>),
	Properties {
		required: Vec<(String, CompiledSchema)>,
		optional: Vec<(String, CompiledSchema)>,
		allow_extra: bool,
	},
	Discriminator {
		tag: String,
		mapping: Vec<(String, CompiledSchema)>,
	},
	Nullable(Box<CompiledSchema>),
}

/// A single validation error with path, expected type, and actual value description.
#[derive(Debug, Clone)]
pub struct ValidationDetail {
	pub path: String,
	pub expected: String,
	pub actual: String,
}

impl ValidationDetail {
	pub fn to_json(&self) -> Value {
		serde_json::json!({
			"path": self.path,
			"expected": self.expected,
			"actual": self.actual,
		})
	}
}

const MAX_ERRORS: usize = 10;
const MAX_DEPTH: usize = 32;

// -- Compilation --

fn parse_jtd_type(s: &str) -> Result<JtdType, String> {
	match s {
		"boolean" => Ok(JtdType::Boolean),
		"string" => Ok(JtdType::String),
		"timestamp" => Ok(JtdType::Timestamp),
		"int8" => Ok(JtdType::Int8),
		"int16" => Ok(JtdType::Int16),
		"int32" => Ok(JtdType::Int32),
		"uint8" => Ok(JtdType::Uint8),
		"uint16" => Ok(JtdType::Uint16),
		"uint32" => Ok(JtdType::Uint32),
		"float32" => Ok(JtdType::Float32),
		"float64" => Ok(JtdType::Float64),
		other => Err(format!("unknown JTD type: {other}")),
	}
}

fn compile_inner(schema: &Value, defs: &Map<String, Value>) -> Result<CompiledSchema, String> {
	let obj = schema.as_object().ok_or_else(|| "schema must be an object".to_string())?;

	// Handle nullable wrapper
	let nullable = obj.get("nullable").and_then(Value::as_bool).unwrap_or(false);

	// Handle ref
	if let Some(ref_name) = obj.get("ref").and_then(Value::as_str) {
		let def = defs.get(ref_name).ok_or_else(|| format!("undefined ref: {ref_name}"))?;
		let inner = compile_inner(def, defs)?;
		return if nullable { Ok(CompiledSchema::Nullable(Box::new(inner))) } else { Ok(inner) };
	}

	let inner = if let Some(type_val) = obj.get("type").and_then(Value::as_str) {
		CompiledSchema::Type(parse_jtd_type(type_val)?)
	} else if let Some(enum_val) = obj.get("enum") {
		let arr = enum_val.as_array().ok_or_else(|| "enum must be an array".to_string())?;
		let variants = arr
			.iter()
			.map(|v| {
				v.as_str().map(String::from).ok_or_else(|| "enum values must be strings".to_string())
			})
			.collect::<Result<Vec<_>, _>>()?;
		CompiledSchema::Enum(variants)
	} else if let Some(elements_val) = obj.get("elements") {
		CompiledSchema::Elements(Box::new(compile_inner(elements_val, defs)?))
	} else if let Some(values_val) = obj.get("values") {
		CompiledSchema::Values(Box::new(compile_inner(values_val, defs)?))
	} else if obj.contains_key("properties") || obj.contains_key("optionalProperties") {
		let mut required = Vec::new();
		let mut optional = Vec::new();

		if let Some(props) = obj.get("properties").and_then(Value::as_object) {
			for (key, val) in props {
				required.push((key.clone(), compile_inner(val, defs)?));
			}
		}
		if let Some(props) = obj.get("optionalProperties").and_then(Value::as_object) {
			for (key, val) in props {
				optional.push((key.clone(), compile_inner(val, defs)?));
			}
		}

		let allow_extra = obj.get("additionalProperties").and_then(Value::as_bool).unwrap_or(false);

		CompiledSchema::Properties { required, optional, allow_extra }
	} else if let Some(disc_val) = obj.get("discriminator").and_then(Value::as_str) {
		let mapping_obj = obj
			.get("mapping")
			.and_then(Value::as_object)
			.ok_or_else(|| "discriminator requires mapping".to_string())?;
		let mut mapping = Vec::new();
		for (key, val) in mapping_obj {
			mapping.push((key.clone(), compile_inner(val, defs)?));
		}
		CompiledSchema::Discriminator { tag: disc_val.to_string(), mapping }
	} else {
		CompiledSchema::Empty
	};

	if nullable { Ok(CompiledSchema::Nullable(Box::new(inner))) } else { Ok(inner) }
}

/// Compile a JTD schema JSON value into a `CompiledSchema` for fast validation.
pub fn compile_schema(schema: &Value) -> Result<CompiledSchema, String> {
	let defs = schema.get("definitions").and_then(Value::as_object).cloned().unwrap_or_default();
	compile_inner(schema, &defs)
}

// -- Validation --

fn value_description(v: &Value) -> String {
	match v {
		Value::Null => "null".into(),
		Value::Bool(_) => "boolean".into(),
		Value::Number(_) => "number".into(),
		Value::String(_) => "string".into(),
		Value::Array(_) => "array".into(),
		Value::Object(_) => "object".into(),
	}
}

fn is_valid_timestamp(s: &str) -> bool {
	// Basic RFC 3339 structural check: YYYY-..T..:..:..[Z|+|-]
	if s.len() < 20 {
		return false;
	}
	let bytes = s.as_bytes();
	// First 4 chars must be digits (year)
	if !bytes[..4].iter().all(u8::is_ascii_digit) {
		return false;
	}
	// Must contain date separator and time separators
	if bytes[4] != b'-' {
		return false;
	}
	// Find T or t separator
	let Some(t_pos) = bytes.iter().position(|&b| b == b'T' || b == b't') else {
		return false;
	};
	// Must have colon in time portion
	if !bytes[t_pos..].contains(&b':') {
		return false;
	}
	// Must have timezone indicator after T: Z, z, +, or -
	let after_t = &bytes[t_pos + 1..];
	after_t.iter().any(|&b| b == b'Z' || b == b'z' || b == b'+' || b == b'-')
}

fn check_int_range(v: f64, min: f64, max: f64) -> bool {
	v.floor() == v && v >= min && v <= max
}

/// Bundled state for the recursive validation walker.
struct ValidateCtx<'a> {
	errors: &'a mut Vec<ValidationDetail>,
	max_errors: usize,
	max_depth: usize,
}

impl ValidateCtx<'_> {
	fn full(&self) -> bool {
		self.errors.len() >= self.max_errors
	}

	fn push(&mut self, path: &str, expected: impl Into<String>, actual: impl Into<String>) {
		self.errors.push(ValidationDetail {
			path: path.into(),
			expected: expected.into(),
			actual: actual.into(),
		});
	}
}

fn validate_type(jtd_type: &JtdType, data: &Value, path: &str, ctx: &mut ValidateCtx<'_>) {
	match jtd_type {
		JtdType::Boolean => {
			if !data.is_boolean() {
				ctx.push(path, "boolean", value_description(data));
			}
		}
		JtdType::String => {
			if !data.is_string() {
				ctx.push(path, "string", value_description(data));
			}
		}
		JtdType::Timestamp => {
			if let Some(s) = data.as_str() {
				if !is_valid_timestamp(s) {
					ctx.push(path, "timestamp (RFC 3339)", format!("string \"{s}\""));
				}
			} else {
				ctx.push(path, "timestamp (RFC 3339)", value_description(data));
			}
		}
		JtdType::Float32 | JtdType::Float64 => {
			if !data.is_number() {
				ctx.push(path, "number", value_description(data));
			}
		}
		int_type => {
			let (label, min, max) = match int_type {
				JtdType::Int8 => ("int8 (-128..127)", -128.0, 127.0),
				JtdType::Int16 => ("int16 (-32768..32767)", -32768.0, 32767.0),
				JtdType::Int32 => ("int32 (-2147483648..2147483647)", -2_147_483_648.0, 2_147_483_647.0),
				JtdType::Uint8 => ("uint8 (0..255)", 0.0, 255.0),
				JtdType::Uint16 => ("uint16 (0..65535)", 0.0, 65535.0),
				JtdType::Uint32 => ("uint32 (0..4294967295)", 0.0, 4_294_967_295.0),
				_ => unreachable!(),
			};
			if let Some(n) = data.as_f64() {
				if !check_int_range(n, min, max) {
					ctx.push(path, label, format!("number {n}"));
				}
			} else {
				// Strip range from label for "wrong type" message
				let short = label.split(' ').next().unwrap_or(label);
				ctx.push(path, short, value_description(data));
			}
		}
	}
}

fn validate_walk(
	schema: &CompiledSchema,
	data: &Value,
	path: &str,
	ctx: &mut ValidateCtx<'_>,
	depth: usize,
	exclude_key: Option<&str>,
) {
	if ctx.full() {
		return;
	}
	if depth > ctx.max_depth {
		ctx.push(path, "depth <= max", format!("depth {depth} exceeds max {}", ctx.max_depth));
		return;
	}

	match schema {
		CompiledSchema::Empty => {}

		CompiledSchema::Nullable(inner) => {
			if !data.is_null() {
				validate_walk(inner, data, path, ctx, depth + 1, None);
			}
		}

		CompiledSchema::Type(jtd_type) => validate_type(jtd_type, data, path, ctx),

		CompiledSchema::Enum(variants) => {
			if let Some(s) = data.as_str() {
				if !variants.iter().any(|v| v == s) {
					ctx.push(path, format!("one of [{}]", variants.join(", ")), format!("string \"{s}\""));
				}
			} else {
				ctx.push(path, "string (enum)", value_description(data));
			}
		}

		CompiledSchema::Elements(inner) => {
			if let Some(arr) = data.as_array() {
				for (i, item) in arr.iter().enumerate() {
					if ctx.full() {
						break;
					}
					validate_walk(inner, item, &format!("{path}/{i}"), ctx, depth + 1, None);
				}
			} else {
				ctx.push(path, "array", value_description(data));
			}
		}

		CompiledSchema::Values(inner) => {
			if let Some(obj) = data.as_object() {
				for (key, val) in obj {
					if ctx.full() {
						break;
					}
					validate_walk(inner, val, &format!("{path}/{key}"), ctx, depth + 1, None);
				}
			} else {
				ctx.push(path, "object", value_description(data));
			}
		}

		CompiledSchema::Properties { required, optional, allow_extra } => {
			validate_properties(required, optional, *allow_extra, data, path, ctx, depth, exclude_key);
		}

		CompiledSchema::Discriminator { tag, mapping } => {
			validate_discriminator(tag, mapping, data, path, ctx, depth);
		}
	}
}

#[allow(clippy::too_many_arguments)]
fn validate_properties(
	required: &[(String, CompiledSchema)],
	optional: &[(String, CompiledSchema)],
	allow_extra: bool,
	data: &Value,
	path: &str,
	ctx: &mut ValidateCtx<'_>,
	depth: usize,
	exclude_key: Option<&str>,
) {
	let Some(obj) = data.as_object() else {
		ctx.push(path, "object", value_description(data));
		return;
	};

	for (key, schema) in required {
		if ctx.full() {
			break;
		}
		match obj.get(key) {
			Some(val) => {
				validate_walk(schema, val, &format!("{path}/{key}"), ctx, depth + 1, None);
			}
			None => ctx.push(&format!("{path}/{key}"), "required property", "missing"),
		}
	}

	for (key, schema) in optional {
		if ctx.full() {
			break;
		}
		if let Some(val) = obj.get(key) {
			validate_walk(schema, val, &format!("{path}/{key}"), ctx, depth + 1, None);
		}
	}

	if !allow_extra {
		for key in obj.keys() {
			if ctx.full() {
				break;
			}
			let is_known = required.iter().any(|(k, _)| k == key)
				|| optional.iter().any(|(k, _)| k == key)
				|| exclude_key == Some(key.as_str());
			if !is_known {
				ctx.push(
					&format!("{path}/{key}"),
					"no extra properties",
					format!("unexpected property \"{key}\""),
				);
			}
		}
	}
}

fn validate_discriminator(
	tag: &str,
	mapping: &[(String, CompiledSchema)],
	data: &Value,
	path: &str,
	ctx: &mut ValidateCtx<'_>,
	depth: usize,
) {
	let Some(obj) = data.as_object() else {
		ctx.push(path, "object", value_description(data));
		return;
	};

	match obj.get(tag).and_then(Value::as_str) {
		Some(tag_value) => {
			if let Some((_, branch_schema)) = mapping.iter().find(|(k, _)| k == tag_value) {
				// JTD spec: tag key is implicitly allowed in the branch schema
				validate_walk(branch_schema, data, path, ctx, depth + 1, Some(tag));
			} else {
				let expected = format!(
					"one of [{}]",
					mapping.iter().map(|(k, _)| k.as_str()).collect::<Vec<_>>().join(", ")
				);
				ctx.push(&format!("{path}/{tag}"), expected, format!("string \"{tag_value}\""));
			}
		}
		None => {
			let actual =
				if obj.contains_key(tag) { value_description(&obj[tag]) } else { "missing".into() };
			ctx.push(&format!("{path}/{tag}"), format!("string (discriminator tag \"{tag}\")"), actual);
		}
	}
}

/// Validate `data` against a JTD schema (compiles on each call).
/// Returns `Ok(())` if valid, or `Err((summary, details))` on failure.
pub fn validate_input(schema: &Value, data: &Value) -> Result<(), (String, Vec<ValidationDetail>)> {
	let compiled = compile_schema(schema).map_err(|e| (e, vec![]))?;
	validate_compiled(&compiled, data)
}

/// Validate `data` against a pre-compiled schema.
/// Returns `Ok(())` if valid, or `Err((summary, details))` on failure.
pub fn validate_compiled(
	schema: &CompiledSchema,
	data: &Value,
) -> Result<(), (String, Vec<ValidationDetail>)> {
	let mut errors = Vec::new();
	let mut ctx = ValidateCtx { errors: &mut errors, max_errors: MAX_ERRORS, max_depth: MAX_DEPTH };
	validate_walk(schema, data, "", &mut ctx, 0, None);
	if errors.is_empty() {
		Ok(())
	} else {
		let count = errors.len();
		let summary = if count == 1 {
			"validation failed: 1 error".into()
		} else {
			format!("validation failed: {count} errors")
		};
		Err((summary, errors))
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use serde_json::json;

	// -- empty schema --

	#[test]
	fn empty_schema_accepts_anything() {
		assert!(validate_input(&json!({}), &json!(42)).is_ok());
		assert!(validate_input(&json!({}), &json!("hello")).is_ok());
		assert!(validate_input(&json!({}), &json!(null)).is_ok());
		assert!(validate_input(&json!({}), &json!([1, 2])).is_ok());
		assert!(validate_input(&json!({}), &json!({"a": 1})).is_ok());
	}

	// -- string type --

	#[test]
	fn string_type_accepts_string() {
		assert!(validate_input(&json!({"type": "string"}), &json!("hello")).is_ok());
	}

	#[test]
	fn string_type_rejects_number() {
		assert!(validate_input(&json!({"type": "string"}), &json!(42)).is_err());
	}

	// -- boolean type --

	#[test]
	fn boolean_type_accepts_bool() {
		assert!(validate_input(&json!({"type": "boolean"}), &json!(true)).is_ok());
		assert!(validate_input(&json!({"type": "boolean"}), &json!(false)).is_ok());
	}

	#[test]
	fn boolean_type_rejects_string() {
		assert!(validate_input(&json!({"type": "boolean"}), &json!("true")).is_err());
	}

	// -- int32 --

	#[test]
	fn int32_accepts_valid() {
		assert!(validate_input(&json!({"type": "int32"}), &json!(42)).is_ok());
		assert!(validate_input(&json!({"type": "int32"}), &json!(-1)).is_ok());
		assert!(validate_input(&json!({"type": "int32"}), &json!(0)).is_ok());
	}

	#[test]
	fn int32_rejects_out_of_range() {
		let result = validate_input(&json!({"type": "int32"}), &json!(2_147_483_648_i64));
		assert!(result.is_err());
	}

	#[test]
	fn int32_rejects_float() {
		let result = validate_input(&json!({"type": "int32"}), &json!(1.5));
		assert!(result.is_err());
	}

	#[test]
	fn int32_rejects_string() {
		let result = validate_input(&json!({"type": "int32"}), &json!("hello"));
		assert!(result.is_err());
	}

	// -- uint8 --

	#[test]
	fn uint8_accepts_valid_range() {
		assert!(validate_input(&json!({"type": "uint8"}), &json!(0)).is_ok());
		assert!(validate_input(&json!({"type": "uint8"}), &json!(255)).is_ok());
		assert!(validate_input(&json!({"type": "uint8"}), &json!(128)).is_ok());
	}

	#[test]
	fn uint8_rejects_negative() {
		assert!(validate_input(&json!({"type": "uint8"}), &json!(-1)).is_err());
	}

	#[test]
	fn uint8_rejects_over_255() {
		assert!(validate_input(&json!({"type": "uint8"}), &json!(256)).is_err());
	}

	// -- int8 --

	#[test]
	fn int8_accepts_valid_range() {
		assert!(validate_input(&json!({"type": "int8"}), &json!(-128)).is_ok());
		assert!(validate_input(&json!({"type": "int8"}), &json!(127)).is_ok());
	}

	#[test]
	fn int8_rejects_out_of_range() {
		assert!(validate_input(&json!({"type": "int8"}), &json!(128)).is_err());
		assert!(validate_input(&json!({"type": "int8"}), &json!(-129)).is_err());
	}

	// -- float64 --

	#[test]
	fn float64_accepts_any_number() {
		assert!(validate_input(&json!({"type": "float64"}), &json!(3.125)).is_ok());
		assert!(validate_input(&json!({"type": "float64"}), &json!(42)).is_ok());
		assert!(validate_input(&json!({"type": "float64"}), &json!(-0.001)).is_ok());
	}

	#[test]
	fn float64_rejects_non_number() {
		assert!(validate_input(&json!({"type": "float64"}), &json!("3.14")).is_err());
	}

	// -- timestamp --

	#[test]
	fn timestamp_accepts_rfc3339() {
		assert!(validate_input(&json!({"type": "timestamp"}), &json!("2024-01-15T10:30:00Z")).is_ok());
	}

	#[test]
	fn timestamp_rejects_invalid() {
		let result = validate_input(&json!({"type": "timestamp"}), &json!("not-a-date"));
		assert!(result.is_err());
	}

	// -- enum --

	#[test]
	fn enum_accepts_valid_value() {
		let schema = json!({"enum": ["red", "green", "blue"]});
		assert!(validate_input(&schema, &json!("red")).is_ok());
		assert!(validate_input(&schema, &json!("blue")).is_ok());
	}

	#[test]
	fn enum_rejects_invalid_value() {
		let schema = json!({"enum": ["red", "green", "blue"]});
		let result = validate_input(&schema, &json!("yellow"));
		assert!(result.is_err());
		let Err((_, details)) = result else { unreachable!() };
		assert!(details[0].expected.contains("red"));
	}

	// -- elements --

	#[test]
	fn elements_validates_array_items() {
		let schema = json!({"elements": {"type": "string"}});
		assert!(validate_input(&schema, &json!(["a", "b", "c"])).is_ok());
		assert!(validate_input(&schema, &json!([])).is_ok());
	}

	#[test]
	fn elements_rejects_invalid_items() {
		let schema = json!({"elements": {"type": "string"}});
		let result = validate_input(&schema, &json!(["a", 42, "c"]));
		assert!(result.is_err());
		let Err((_, details)) = result else { unreachable!() };
		assert_eq!(details[0].path, "/1");
	}

	#[test]
	fn elements_rejects_non_array() {
		let schema = json!({"elements": {"type": "string"}});
		assert!(validate_input(&schema, &json!("not an array")).is_err());
	}

	// -- values --

	#[test]
	fn values_validates_object_values() {
		let schema = json!({"values": {"type": "int32"}});
		assert!(validate_input(&schema, &json!({"a": 1, "b": 2})).is_ok());
	}

	#[test]
	fn values_rejects_invalid_values() {
		let schema = json!({"values": {"type": "int32"}});
		assert!(validate_input(&schema, &json!({"a": 1, "b": "nope"})).is_err());
	}

	// -- properties --

	#[test]
	fn properties_required_present() {
		let schema = json!({
			"properties": {
				"name": {"type": "string"},
				"age": {"type": "int32"}
			}
		});
		assert!(validate_input(&schema, &json!({"name": "Alice", "age": 30})).is_ok());
	}

	#[test]
	fn properties_required_missing() {
		let schema = json!({
			"properties": {
				"name": {"type": "string"},
				"age": {"type": "int32"}
			}
		});
		let result = validate_input(&schema, &json!({"name": "Alice"}));
		assert!(result.is_err());
		let Err((_, details)) = result else { unreachable!() };
		assert!(details.iter().any(|d| d.path == "/age" && d.actual == "missing"));
	}

	#[test]
	fn properties_optional_present() {
		let schema = json!({
			"properties": {"name": {"type": "string"}},
			"optionalProperties": {"age": {"type": "int32"}}
		});
		assert!(validate_input(&schema, &json!({"name": "Alice", "age": 30})).is_ok());
	}

	#[test]
	fn properties_optional_absent() {
		let schema = json!({
			"properties": {"name": {"type": "string"}},
			"optionalProperties": {"age": {"type": "int32"}}
		});
		assert!(validate_input(&schema, &json!({"name": "Alice"})).is_ok());
	}

	#[test]
	fn properties_allow_extra() {
		let schema = json!({
			"properties": {"name": {"type": "string"}},
			"additionalProperties": true
		});
		assert!(validate_input(&schema, &json!({"name": "Alice", "extra": 42})).is_ok());
	}

	#[test]
	fn properties_reject_extra() {
		let schema = json!({
			"properties": {"name": {"type": "string"}}
		});
		let result = validate_input(&schema, &json!({"name": "Alice", "extra": 42}));
		assert!(result.is_err());
		let Err((_, details)) = result else { unreachable!() };
		assert!(details.iter().any(|d| d.path == "/extra" && d.actual.contains("unexpected")));
	}

	// -- discriminator --

	#[test]
	fn discriminator_validates_correct_branch() {
		let schema = json!({
			"discriminator": "type",
			"mapping": {
				"circle": {
					"properties": {"radius": {"type": "float64"}}
				},
				"square": {
					"properties": {"side": {"type": "float64"}}
				}
			}
		});
		assert!(validate_input(&schema, &json!({"type": "circle", "radius": 5.0})).is_ok());
		assert!(validate_input(&schema, &json!({"type": "square", "side": 3.0})).is_ok());
	}

	#[test]
	fn discriminator_missing_tag() {
		let schema = json!({
			"discriminator": "type",
			"mapping": {
				"circle": {"properties": {"radius": {"type": "float64"}}}
			}
		});
		let result = validate_input(&schema, &json!({"radius": 5.0}));
		assert!(result.is_err());
		let Err((_, details)) = result else { unreachable!() };
		assert!(details[0].actual == "missing");
	}

	// -- nullable --

	#[test]
	fn nullable_accepts_null() {
		let schema = json!({"type": "string", "nullable": true});
		assert!(validate_input(&schema, &json!(null)).is_ok());
	}

	#[test]
	fn nullable_accepts_valid_inner() {
		let schema = json!({"type": "string", "nullable": true});
		assert!(validate_input(&schema, &json!("hello")).is_ok());
	}

	#[test]
	fn nullable_rejects_invalid_inner() {
		let schema = json!({"type": "string", "nullable": true});
		assert!(validate_input(&schema, &json!(42)).is_err());
	}

	// -- ref/definitions --

	#[test]
	fn ref_resolves_definition() {
		let schema = json!({
			"definitions": {
				"coords": {
					"properties": {
						"x": {"type": "float64"},
						"y": {"type": "float64"}
					}
				}
			},
			"properties": {
				"origin": {"ref": "coords"},
				"dest": {"ref": "coords"}
			}
		});
		assert!(
			validate_input(
				&schema,
				&json!({
					"origin": {"x": 0.0, "y": 0.0},
					"dest": {"x": 1.0, "y": 2.0}
				})
			)
			.is_ok()
		);
	}

	#[test]
	fn ref_validates_definition() {
		let schema = json!({
			"definitions": {
				"name": {"type": "string"}
			},
			"ref": "name"
		});
		assert!(validate_input(&schema, &json!("Alice")).is_ok());
		assert!(validate_input(&schema, &json!(42)).is_err());
	}

	// -- depth limit --

	#[test]
	fn depth_limit_produces_error() {
		// Build a deeply nested schema that exceeds MAX_DEPTH
		let mut schema = json!({"type": "string"});
		for _ in 0..35 {
			schema = json!({"elements": schema});
		}
		let compiled = compile_schema(&schema).unwrap();

		// Build matching deeply nested data
		let mut data: Value = json!("deep");
		for _ in 0..35 {
			data = json!([data]);
		}

		let result = validate_compiled(&compiled, &data);
		assert!(result.is_err());
		let Err((_, details)) = result else { unreachable!() };
		assert!(details.iter().any(|d| d.actual.contains("exceeds max")));
	}

	// -- max errors cap --

	#[test]
	fn max_errors_caps_at_10() {
		let schema = json!({"elements": {"type": "string"}});
		// 20 invalid items
		let data: Value = Value::Array((0..20).map(|i| json!(i)).collect());
		let result = validate_input(&schema, &data);
		assert!(result.is_err());
		let Err((_, details)) = result else { unreachable!() };
		assert_eq!(details.len(), MAX_ERRORS);
	}

	// -- validate_compiled --

	#[test]
	fn validate_compiled_works() {
		let schema = json!({"type": "string"});
		let compiled = compile_schema(&schema).unwrap();
		assert!(validate_compiled(&compiled, &json!("ok")).is_ok());
		assert!(validate_compiled(&compiled, &json!(42)).is_err());
	}

	// -- validation_detail json --

	#[test]
	fn validation_detail_to_json() {
		let detail =
			ValidationDetail { path: "/name".into(), expected: "string".into(), actual: "number".into() };
		let j = detail.to_json();
		assert_eq!(j["path"], "/name");
		assert_eq!(j["expected"], "string");
		assert_eq!(j["actual"], "number");
	}

	// -- should_validate --

	#[test]
	fn should_validate_never() {
		assert!(!should_validate(&ValidationMode::Never));
	}

	#[test]
	fn should_validate_always() {
		assert!(should_validate(&ValidationMode::Always));
	}
}
