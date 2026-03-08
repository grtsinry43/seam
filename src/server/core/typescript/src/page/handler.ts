/* src/server/core/typescript/src/page/handler.ts */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { renderPage, escapeHtml } from '@canmi/seam-engine'
import { SeamError } from '../errors.js'
import type { InternalProcedure } from '../procedure.js'
import type { PageDef, LayoutDef, LoaderFn, I18nConfig } from './index.js'
import { applyProjection } from './projection.js'

export interface PageTiming {
	/** Procedure execution time in milliseconds */
	dataFetch: number
	/** Template injection time in milliseconds */
	inject: number
}

export interface HandlePageResult {
	status: number
	html: string
	timing?: PageTiming
}

export interface I18nOpts {
	locale: string
	config: I18nConfig
	/** Route pattern for hash-based message lookup */
	routePattern: string
}

interface LoaderResults {
	data: Record<string, unknown>
	meta: Record<string, { procedure: string; input: unknown }>
}

/** Execute loaders, returning keyed results and metadata */
async function executeLoaders(
	loaders: Record<string, LoaderFn>,
	params: Record<string, string>,
	procedures: Map<string, InternalProcedure>,
	searchParams?: URLSearchParams,
	ctxResolver?: (proc: InternalProcedure) => Record<string, unknown>,
): Promise<LoaderResults> {
	const entries = Object.entries(loaders)
	const results = await Promise.all(
		entries.map(async ([key, loader]) => {
			const { procedure, input } = loader(params, searchParams)
			const proc = procedures.get(procedure)
			if (!proc) throw new SeamError('INTERNAL_ERROR', `Procedure '${procedure}' not found`)
			// Skip JTD validation -- loader input is trusted server-side code
			const ctx = ctxResolver ? ctxResolver(proc) : {}
			const result = await proc.handler({ input, ctx })
			return { key, result, procedure, input }
		}),
	)
	return {
		data: Object.fromEntries(results.map((r) => [r.key, r.result])),
		meta: Object.fromEntries(
			results.map((r) => [r.key, { procedure: r.procedure, input: r.input }]),
		),
	}
}

/** Select the template for a given locale, falling back to the default template */
function selectTemplate(
	defaultTemplate: string,
	localeTemplates: Record<string, string> | undefined,
	locale: string | undefined,
): string {
	if (locale && localeTemplates) {
		return localeTemplates[locale] ?? defaultTemplate
	}
	return defaultTemplate
}

/** Look up pre-resolved messages for a route + locale. Zero merge, zero filter. */
function lookupMessages(
	config: I18nConfig,
	routePattern: string,
	locale: string,
): Record<string, string> {
	const routeHash = config.routeHashes[routePattern]
	if (!routeHash) return {}

	if (config.mode === 'paged' && config.distDir) {
		const filePath = join(config.distDir, 'i18n', routeHash, `${locale}.json`)
		if (existsSync(filePath)) {
			return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, string>
		}
		return {}
	}

	return config.messages[locale]?.[routeHash] ?? {}
}

export async function handlePageRequest(
	page: PageDef,
	params: Record<string, string>,
	procedures: Map<string, InternalProcedure>,
	i18nOpts?: I18nOpts,
	searchParams?: URLSearchParams,
	ctxResolver?: (proc: InternalProcedure) => Record<string, unknown>,
): Promise<HandlePageResult> {
	try {
		const t0 = performance.now()
		const layoutChain = page.layoutChain ?? []
		const locale = i18nOpts?.locale

		// Execute all loaders (layout chain + page) in parallel
		const loaderResults = await Promise.all([
			...layoutChain.map((layout) =>
				executeLoaders(layout.loaders, params, procedures, searchParams, ctxResolver),
			),
			executeLoaders(page.loaders, params, procedures, searchParams, ctxResolver),
		])

		const t1 = performance.now()

		// Merge all loader data and metadata into single objects
		const allData: Record<string, unknown> = {}
		const allMeta: Record<string, { procedure: string; input: unknown }> = {}
		for (const { data, meta } of loaderResults) {
			Object.assign(allData, data)
			Object.assign(allMeta, meta)
		}

		// Prune to projected fields before template injection
		const prunedData = applyProjection(allData, page.projections)

		// Compose template: nest page inside layouts via outlet substitution
		const pageTemplate = selectTemplate(page.template, page.localeTemplates, locale)
		let composedTemplate = pageTemplate
		for (let i = layoutChain.length - 1; i >= 0; i--) {
			const layout = layoutChain[i] as LayoutDef
			const layoutTemplate = selectTemplate(layout.template, layout.localeTemplates, locale)
			composedTemplate = layoutTemplate.replace('<!--seam:outlet-->', composedTemplate)
		}

		// Build PageConfig for engine
		const config: Record<string, unknown> = {
			layout_chain: layoutChain.map((l) => ({
				id: l.id,
				loader_keys: Object.keys(l.loaders),
			})),
			data_id: page.dataId ?? '__data',
			head_meta: page.headMeta,
			loader_metadata: allMeta,
		}
		if (page.pageAssets) {
			config.page_assets = page.pageAssets
		}

		// Build I18nOpts for engine (hash-based lookup — zero merge, zero filter)
		let i18nOptsJson: string | undefined
		if (i18nOpts) {
			const { config: i18nConfig, routePattern } = i18nOpts
			const messages = lookupMessages(i18nConfig, routePattern, i18nOpts.locale)
			const routeHash = i18nConfig.routeHashes[routePattern]
			const i18nData: Record<string, unknown> = {
				locale: i18nOpts.locale,
				default_locale: i18nConfig.default,
				messages,
			}
			// Inject content hash and router table when cache is enabled
			if (i18nConfig.cache && routeHash) {
				i18nData.hash = i18nConfig.contentHashes[routeHash]?.[i18nOpts.locale]
				i18nData.router = i18nConfig.contentHashes
			}
			i18nOptsJson = JSON.stringify(i18nData)
		}

		// Single WASM call: inject slots, compose data script, apply locale/meta
		const html = renderPage(
			composedTemplate,
			JSON.stringify(prunedData),
			JSON.stringify(config),
			i18nOptsJson,
		)

		const t2 = performance.now()

		return {
			status: 200,
			html,
			timing: { dataFetch: t1 - t0, inject: t2 - t1 },
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		return {
			status: 500,
			html: `<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1><p>${escapeHtml(message)}</p></body></html>`,
		}
	}
}
