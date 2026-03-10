/* src/client/react/src/head.ts */

import type { HeadConfig, HeadFn, HeadMeta } from './types.js'

const SLOT_PREFIX = '<!--seam:'
const SLOT_SUFFIX = '-->'

/**
 * Build a deep Proxy that returns slot marker strings for property access.
 * Template literal concatenation works naturally:
 *   `${proxy.post.title} | Blog` → `<!--seam:post.title--> | Blog`
 */
export function buildHeadSlotProxy(prefix = ''): unknown {
	return new Proxy(Object.create(null) as Record<string, unknown>, {
		get(_, prop) {
			if (typeof prop === 'symbol') {
				if (prop === Symbol.toPrimitive) {
					return () => (prefix ? `${SLOT_PREFIX}${prefix}${SLOT_SUFFIX}` : '')
				}
				return undefined
			}
			if (prop === 'then' || prop === 'toJSON') return undefined
			const path = prefix ? `${prefix}.${prop}` : String(prop)
			return buildHeadSlotProxy(path)
		},
	})
}

/**
 * Convert a HeadConfig (where values may contain <!--seam:...--> slot markers)
 * into raw HTML. Slot markers are preserved for the engine's inject_no_script
 * to resolve at request time.
 */
export function headConfigToSlotHtml(config: HeadConfig): string {
	let html = ''
	if (config.title !== undefined) {
		html += `<title>${config.title}</title>`
	}
	for (const meta of config.meta ?? []) {
		html += '<meta'
		for (const [k, v] of Object.entries(meta)) {
			if (v !== undefined) html += ` ${k}="${v}"`
		}
		html += '>'
	}
	for (const link of config.link ?? []) {
		html += '<link'
		for (const [k, v] of Object.entries(link)) {
			if (v !== undefined) html += ` ${k}="${v}"`
		}
		html += '>'
	}
	return html
}

/** Identity key for meta dedup: name > property > httpEquiv */
function metaKey(m: HeadMeta): string | undefined {
	return m.name ?? m.property ?? m.httpEquiv
}

/** Merge two static HeadConfig objects. Override wins for title and conflicting meta. */
function mergeStaticHeadConfigs(base: HeadConfig, override: HeadConfig): HeadConfig {
	const result: HeadConfig = {}

	// title: override wins
	result.title = override.title ?? base.title

	// meta: dedup by identity key, override wins on conflict
	const baseMeta = base.meta ?? []
	const overrideMeta = override.meta ?? []
	if (baseMeta.length > 0 || overrideMeta.length > 0) {
		const seen = new Map<string, HeadMeta>()
		const anonymous: HeadMeta[] = []
		for (const m of baseMeta) {
			const k = metaKey(m)
			if (k) seen.set(k, m)
			else anonymous.push(m)
		}
		for (const m of overrideMeta) {
			const k = metaKey(m)
			if (k) seen.set(k, m)
			else anonymous.push(m)
		}
		result.meta = [...seen.values(), ...anonymous]
	}

	// link: concatenate (base first, then override)
	const baseLink = base.link ?? []
	const overrideLink = override.link ?? []
	if (baseLink.length > 0 || overrideLink.length > 0) {
		result.link = [...baseLink, ...overrideLink]
	}

	return result
}

/** Resolve a HeadConfig or HeadFn to a static HeadConfig */
function resolveHead(head: HeadConfig | HeadFn, data: Record<string, unknown>): HeadConfig {
	return typeof head === 'function' ? head(data) : head
}

/**
 * Merge two head configs (static or dynamic). Override wins for title and
 * conflicting meta; links are concatenated.
 */
export function mergeHeadConfigs(
	base: HeadConfig | HeadFn | undefined,
	override: HeadConfig | HeadFn | undefined,
): HeadConfig | HeadFn | undefined {
	if (!base) return override
	if (!override) return base

	// If either side is a function, return a function that merges at call time
	if (typeof base === 'function' || typeof override === 'function') {
		return ((data: Record<string, unknown>) =>
			mergeStaticHeadConfigs(resolveHead(base, data), resolveHead(override, data))) as HeadFn
	}

	return mergeStaticHeadConfigs(base, override)
}
