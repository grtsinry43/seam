/* src/server/core/typescript/src/validation/index.ts */

import { validate } from 'jtd'
import type { Schema, ValidationError as JTDValidationError } from 'jtd'

export interface ValidationResult {
	valid: boolean
	errors: JTDValidationError[]
}

export interface ValidationDetail {
	path: string
	expected?: string
	actual?: string
}

export function validateInput(schema: Schema, data: unknown): ValidationResult {
	const errors = validate(schema, data, { maxDepth: 32, maxErrors: 10 })
	return {
		valid: errors.length === 0,
		errors,
	}
}

export function formatValidationErrors(errors: JTDValidationError[]): string {
	return errors
		.map((e) => {
			const path = e.instancePath.length > 0 ? e.instancePath.join('/') : '(root)'
			const schema = e.schemaPath.join('/')
			return `${path} (schema: ${schema})`
		})
		.join('; ')
}

/** Walk a nested object along a key path, returning undefined if unreachable */
function walkPath(obj: unknown, keys: string[]): unknown {
	let cur = obj
	for (const k of keys) {
		if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
		cur = (cur as Record<string, unknown>)[k]
	}
	return cur
}

/** Extract structured details from JTD validation errors (best-effort) */
export function formatValidationDetails(
	errors: JTDValidationError[],
	schema: Schema,
	data: unknown,
): ValidationDetail[] {
	return errors.map((e) => {
		const path = '/' + e.instancePath.join('/')
		const detail: ValidationDetail = { path }

		// Extract expected type by walking schemaPath — when it ends with "type",
		// the value at that path in the schema is the JTD type keyword
		const schemaValue = walkPath(schema, e.schemaPath)
		if (typeof schemaValue === 'string') {
			detail.expected = schemaValue
		}

		// Extract actual type from the data at instancePath
		const actualValue = walkPath(data, e.instancePath)
		if (actualValue !== undefined) {
			detail.actual = typeof actualValue
		} else if (e.instancePath.length === 0) {
			detail.actual = typeof data
		}

		return detail
	})
}
