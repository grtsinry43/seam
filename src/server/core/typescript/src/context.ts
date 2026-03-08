/* src/server/core/typescript/src/context.ts */

import type { SchemaNode } from './types/schema.js'
import { validateInput, formatValidationErrors } from './validation/index.js'
import { SeamError } from './errors.js'

export interface ContextFieldDef {
	extract: string
	schema: SchemaNode
}

export type ContextConfig = Record<string, ContextFieldDef>
export type RawContextMap = Record<string, string | null>

/** Parse extract rule into source type and key, e.g. "header:authorization" -> { source: "header", key: "authorization" } */
export function parseExtractRule(rule: string): { source: string; key: string } {
	const idx = rule.indexOf(':')
	if (idx === -1) {
		throw new Error(`Invalid extract rule "${rule}": expected "source:key" format`)
	}
	const source = rule.slice(0, idx)
	const key = rule.slice(idx + 1)
	if (!source || !key) {
		throw new Error(`Invalid extract rule "${rule}": source and key must be non-empty`)
	}
	return { source, key }
}

/** Check whether any context fields are defined */
export function contextHasExtracts(config: ContextConfig): boolean {
	return Object.keys(config).length > 0
}

/** Parse a Cookie header into key-value pairs */
export function parseCookieHeader(header: string): Record<string, string> {
	const result: Record<string, string> = {}
	for (const pair of header.split(';')) {
		const idx = pair.indexOf('=')
		if (idx > 0) {
			result[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
		}
	}
	return result
}

/** Build a RawContextMap keyed by config key from request headers, cookies, and query params */
export function buildRawContext(
	config: ContextConfig,
	headerFn: ((name: string) => string | null) | undefined,
	url: URL,
): RawContextMap {
	const raw: RawContextMap = {}
	let cookieCache: Record<string, string> | undefined
	for (const [key, field] of Object.entries(config)) {
		const { source, key: extractKey } = parseExtractRule(field.extract)
		switch (source) {
			case 'header':
				raw[key] = headerFn?.(extractKey) ?? null
				break
			case 'cookie': {
				if (!cookieCache) {
					cookieCache = parseCookieHeader(headerFn?.('cookie') ?? '')
				}
				raw[key] = cookieCache[extractKey] ?? null
				break
			}
			case 'query':
				raw[key] = url.searchParams.get(extractKey) ?? null
				break
			default:
				raw[key] = null
		}
	}
	return raw
}

/**
 * Resolve raw strings into validated context object.
 *
 * For each requested key:
 * - If raw value is null/missing -> pass null to JTD; schema decides via nullable()
 * - If schema expects string -> use raw value directly
 * - If schema expects object -> JSON.parse then validate
 */
export function resolveContext(
	config: ContextConfig,
	raw: RawContextMap,
	requestedKeys: string[],
): Record<string, unknown> {
	const result: Record<string, unknown> = {}

	for (const key of requestedKeys) {
		const field = config[key]
		if (!field) {
			throw new SeamError(
				'CONTEXT_ERROR',
				`Context field "${key}" is not defined in router context config`,
				400,
			)
		}

		const rawValue = raw[key] ?? null

		let value: unknown
		if (rawValue === null) {
			value = null
		} else {
			const schema = field.schema._schema
			// If the root schema is { type: "string" } or nullable string, use raw value directly
			const isStringSchema =
				'type' in schema && schema.type === 'string' && !('nullable' in schema && schema.nullable)
			const isNullableStringSchema =
				'type' in schema && schema.type === 'string' && 'nullable' in schema && schema.nullable

			if (isStringSchema || isNullableStringSchema) {
				value = rawValue
			} else {
				// Attempt JSON parse for complex types
				try {
					value = JSON.parse(rawValue)
				} catch {
					throw new SeamError(
						'CONTEXT_ERROR',
						`Context field "${key}": failed to parse value as JSON`,
						400,
					)
				}
			}
		}

		const validation = validateInput(field.schema._schema, value)
		if (!validation.valid) {
			const details = formatValidationErrors(validation.errors)
			throw new SeamError(
				'CONTEXT_ERROR',
				`Context field "${key}" validation failed: ${details}`,
				400,
			)
		}

		result[key] = value
	}

	return result
}

/** Syntax sugar for building extract rules; the underlying "source:key" format is unchanged. */
export const extract = {
	header: (name: string): string => `header:${name}`,
	cookie: (name: string): string => `cookie:${name}`,
	query: (name: string): string => `query:${name}`,
}
