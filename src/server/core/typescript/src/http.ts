/* src/server/core/typescript/src/http.ts */

import type { RawContextMap } from './context.js'
import { buildRawContext } from './context.js'
import { watchReloadTrigger } from './dev/index.js'
import { loadBuildDev } from './page/build-loader.js'
import type { SeamFileHandle } from './procedure.js'
import type { DefinitionMap, Router } from './router/index.js'
import {
	buildHashLookup,
	createDevReloadResponse,
	getSseHeaders,
	sseCompleteEvent,
	sseDataEvent,
	sseDataEventWithId,
	sseErrorEvent,
	sseStream,
	sseStreamForStream,
	withSseLifecycle,
} from './http-sse.js'
import {
	drainStream,
	errorResponse,
	handlePublicFile,
	handleStaticAsset,
	jsonResponse,
	serialize,
	toWebResponse,
} from './http-response.js'

export interface HttpRequest {
	method: string
	url: string
	body: () => Promise<unknown>
	header?: (name: string) => string | null
	file?: () => Promise<SeamFileHandle | null>
}

export interface HttpBodyResponse {
	status: number
	headers: Record<string, string>
	body: unknown
}

export interface HttpStreamResponse {
	status: number
	headers: Record<string, string>
	stream: AsyncIterable<string>
	onCancel?: () => void
}

export type HttpResponse = HttpBodyResponse | HttpStreamResponse

export type HttpHandler = (req: HttpRequest) => Promise<HttpResponse>

export interface RpcHashMap {
	procedures: Record<string, string>
	batch: string
}

export interface SseOptions {
	heartbeatInterval?: number
	sseIdleTimeout?: number
}

export interface HttpHandlerOptions {
	staticDir?: string
	publicDir?: string
	fallback?: HttpHandler
	rpcHashMap?: RpcHashMap
	sseOptions?: SseOptions
	devBuildDir?: string
}

const PROCEDURE_PREFIX = '/_seam/procedure/'
const PAGE_PREFIX = '/_seam/page/'
const DATA_PREFIX = '/_seam/data/'
const STATIC_PREFIX = '/_seam/static/'
const MANIFEST_PATH = '/_seam/manifest.json'
const DEV_RELOAD_PATH = '/_seam/dev/reload'

const HTML_HEADER = { 'Content-Type': 'text/html; charset=utf-8' }

function getPageRequestHeaders(req: HttpRequest):
	| {
			url: string
			cookie?: string
			acceptLanguage?: string
	  }
	| undefined {
	if (!req.header) return undefined
	return {
		url: req.url,
		cookie: req.header('cookie') ?? undefined,
		acceptLanguage: req.header('accept-language') ?? undefined,
	}
}

async function handleBatchHttp<T extends DefinitionMap>(
	req: HttpRequest,
	router: Router<T>,
	hashToName: Map<string, string> | null,
	rawCtx?: RawContextMap,
): Promise<HttpBodyResponse> {
	let body: unknown
	try {
		body = await req.body()
	} catch {
		return errorResponse(400, 'VALIDATION_ERROR', 'Invalid JSON body')
	}
	if (!body || typeof body !== 'object' || !Array.isArray((body as { calls?: unknown }).calls)) {
		return errorResponse(400, 'VALIDATION_ERROR', "Batch request must have a 'calls' array")
	}
	const calls = (body as { calls: Array<{ procedure?: unknown; input?: unknown }> }).calls.map(
		(c) => ({
			procedure:
				typeof c.procedure === 'string' ? (hashToName?.get(c.procedure) ?? c.procedure) : '',
			input: c.input ?? {},
		}),
	)
	const result = await router.handleBatch(calls, rawCtx)
	return jsonResponse(200, { ok: true, data: result })
}

function resolveHashName(hashToName: Map<string, string> | null, name: string): string {
	if (!hashToName) return name
	return hashToName.get(name) ?? name
}

async function handleProcedurePost<T extends DefinitionMap>(
	req: HttpRequest,
	router: Router<T>,
	name: string,
	rawCtx?: RawContextMap,
	sseOptions?: SseOptions,
): Promise<HttpResponse> {
	let body: unknown
	try {
		body = await req.body()
	} catch {
		return errorResponse(400, 'VALIDATION_ERROR', 'Invalid JSON body')
	}

	if (router.getKind(name) === 'stream') {
		const controller = new AbortController()
		return {
			status: 200,
			headers: getSseHeaders(),
			stream: withSseLifecycle(
				sseStreamForStream(router, name, body, controller.signal, rawCtx),
				sseOptions,
			),
			onCancel: () => controller.abort(),
		}
	}

	if (router.getKind(name) === 'upload') {
		if (!req.file) {
			return errorResponse(400, 'VALIDATION_ERROR', 'Upload requires multipart/form-data')
		}
		const file = await req.file()
		if (!file) {
			return errorResponse(400, 'VALIDATION_ERROR', 'Upload requires file in multipart body')
		}
		const result = await router.handleUpload(name, body, file, rawCtx)
		return jsonResponse(result.status, result.body)
	}

	const result = await router.handle(name, body, rawCtx)
	return jsonResponse(result.status, result.body)
}

export function createHttpHandler<T extends DefinitionMap>(
	router: Router<T>,
	opts?: HttpHandlerOptions,
): HttpHandler {
	const effectiveHashMap = opts?.rpcHashMap ?? router.rpcHashMap
	const hashToName = buildHashLookup(effectiveHashMap)
	const batchHash = effectiveHashMap?.batch ?? null
	const hasCtx = router.hasContext()

	const devDir =
		opts?.devBuildDir ??
		(process.env.SEAM_DEV === '1' && process.env.SEAM_VITE !== '1'
			? process.env.SEAM_OUTPUT_DIR
			: undefined)
	const devState: { resolvers: Set<() => void> } | null = devDir ? { resolvers: new Set() } : null
	if (devState && devDir) {
		watchReloadTrigger(devDir, () => {
			try {
				router.reload(loadBuildDev(devDir))
			} catch {
				// Manifest might be mid-write; skip this reload cycle
			}
			const batch = devState.resolvers
			devState.resolvers = new Set()
			for (const r of batch) r()
		})
	}

	return async (req) => {
		const url = new URL(req.url, 'http://localhost')
		const { pathname } = url

		const rawCtx: RawContextMap | undefined = hasCtx
			? buildRawContext(router.ctxConfig, req.header, url)
			: undefined

		if (req.method === 'GET' && pathname === MANIFEST_PATH) {
			if (effectiveHashMap) return errorResponse(403, 'FORBIDDEN', 'Manifest disabled')
			return jsonResponse(200, router.manifest())
		}

		if (pathname.startsWith(PROCEDURE_PREFIX)) {
			const rawName = pathname.slice(PROCEDURE_PREFIX.length)
			if (!rawName) {
				return errorResponse(404, 'NOT_FOUND', 'Empty procedure name')
			}

			if (req.method === 'POST') {
				if (rawName === '_batch' || (batchHash && rawName === batchHash)) {
					return handleBatchHttp(req, router, hashToName, rawCtx)
				}
				const name = resolveHashName(hashToName, rawName)
				return handleProcedurePost(req, router, name, rawCtx, opts?.sseOptions)
			}

			if (req.method === 'GET') {
				const name = resolveHashName(hashToName, rawName)
				const rawInput = url.searchParams.get('input')
				let input: unknown
				try {
					input = rawInput ? JSON.parse(rawInput) : {}
				} catch {
					return errorResponse(400, 'VALIDATION_ERROR', 'Invalid input query parameter')
				}

				const lastEventId = req.header?.('last-event-id') ?? undefined
				return {
					status: 200,
					headers: getSseHeaders(),
					stream: withSseLifecycle(
						sseStream(router, name, input, rawCtx, lastEventId),
						opts?.sseOptions,
					),
				}
			}
		}

		if (req.method === 'GET' && pathname.startsWith(PAGE_PREFIX) && router.hasPages) {
			const pagePath = '/' + pathname.slice(PAGE_PREFIX.length)
			const headers = getPageRequestHeaders(req)
			const result = await router.handlePage(pagePath, headers, rawCtx)
			if (result) {
				return { status: result.status, headers: HTML_HEADER, body: result.html }
			}
		}

		if (req.method === 'GET' && pathname.startsWith(DATA_PREFIX) && router.hasPages) {
			const pagePath = '/' + pathname.slice(DATA_PREFIX.length).replace(/\/$/, '')
			const dataResult = await router.handlePageData(pagePath)
			if (dataResult !== null) {
				return jsonResponse(200, dataResult)
			}
		}

		if (req.method === 'GET' && pathname.startsWith(STATIC_PREFIX) && opts?.staticDir) {
			const assetPath = pathname.slice(STATIC_PREFIX.length)
			return handleStaticAsset(assetPath, opts.staticDir)
		}

		if (req.method === 'GET' && pathname === DEV_RELOAD_PATH && devState) {
			return createDevReloadResponse(devState, opts?.sseOptions)
		}

		if (req.method === 'GET' && opts?.publicDir) {
			const publicResult = await handlePublicFile(pathname, opts.publicDir)
			if (publicResult) return publicResult
		}

		if (opts?.fallback) return opts.fallback(req)
		return errorResponse(404, 'NOT_FOUND', 'Not found')
	}
}

export {
	drainStream,
	serialize,
	sseCompleteEvent,
	sseDataEvent,
	sseDataEventWithId,
	sseErrorEvent,
	toWebResponse,
}
