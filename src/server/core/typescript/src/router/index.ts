/* src/server/core/typescript/src/router/index.ts */

import type { RpcHashMap } from '../http.js'
import type { SchemaNode } from '../types/schema.js'
import type { ProcedureManifest } from '../manifest/index.js'
import type { HandleResult } from './handler.js'
import type { SeamFileHandle } from '../procedure.js'
import type { HandlePageResult } from '../page/handler.js'
import type { PageDef, I18nConfig } from '../page/index.js'
import type { ChannelResult } from '../channel.js'
import type { ContextConfig, RawContextMap } from '../context.js'
import type { ResolveStrategy } from '../resolve.js'
import type { BatchCall, BatchResultItem } from './handler.js'
import type { BuildOutput } from '../page/build-loader.js'
import { initRouterState, buildRouterMethods } from './state.js'

export type ProcedureKind = 'query' | 'command' | 'subscription' | 'stream' | 'upload'

export type ValidationMode = 'dev' | 'always' | 'never'

export interface ValidationConfig {
	input?: ValidationMode
}

export type MappingValue = string | { from: string; each?: boolean }

export type InvalidateTarget =
	| string
	| {
			query: string
			mapping?: Record<string, MappingValue>
	  }

export type TransportPreference = 'http' | 'sse' | 'ws' | 'ipc'

export interface TransportConfig {
	prefer: TransportPreference
	fallback?: TransportPreference[]
}

export type CacheConfig = false | { ttl: number }

/** @deprecated Use QueryDef instead */
export interface ProcedureDef<TIn = unknown, TOut = unknown, TState = undefined> {
	kind?: 'query'
	/** @deprecated Use `kind` instead */
	type?: 'query'
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: string[]
	transport?: TransportConfig
	suppress?: string[]
	cache?: CacheConfig
	handler: (params: {
		input: TIn
		ctx: Record<string, unknown>
		state: TState
	}) => TOut | Promise<TOut>
}

export type QueryDef<TIn = unknown, TOut = unknown, TState = undefined> = ProcedureDef<
	TIn,
	TOut,
	TState
>

export interface CommandDef<TIn = unknown, TOut = unknown, TState = undefined> {
	kind?: 'command'
	/** @deprecated Use `kind` instead */
	type?: 'command'
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: string[]
	invalidates?: InvalidateTarget[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: {
		input: TIn
		ctx: Record<string, unknown>
		state: TState
	}) => TOut | Promise<TOut>
}

export interface SubscriptionDef<TIn = unknown, TOut = unknown, TState = undefined> {
	kind?: 'subscription'
	/** @deprecated Use `kind` instead */
	type?: 'subscription'
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: string[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: {
		input: TIn
		ctx: Record<string, unknown>
		state: TState
		lastEventId?: string
	}) => AsyncIterable<TOut>
}

export interface StreamDef<TIn = unknown, TChunk = unknown, TState = undefined> {
	kind: 'stream'
	input: SchemaNode<TIn>
	output: SchemaNode<TChunk>
	error?: SchemaNode
	context?: string[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: {
		input: TIn
		ctx: Record<string, unknown>
		state: TState
	}) => AsyncGenerator<TChunk>
}

export interface UploadDef<TIn = unknown, TOut = unknown, TState = undefined> {
	kind: 'upload'
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: string[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: {
		input: TIn
		file: SeamFileHandle
		ctx: Record<string, unknown>
		state: TState
	}) => TOut | Promise<TOut>
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DefinitionMap = Record<
	string,
	| QueryDef<any, any, any>
	| CommandDef<any, any, any>
	| SubscriptionDef<any, any, any>
	| StreamDef<any, any, any>
	| UploadDef<any, any, any>
>

type NestedDefinitionValue =
	| QueryDef<any, any, any>
	| CommandDef<any, any, any>
	| SubscriptionDef<any, any, any>
	| StreamDef<any, any, any>
	| UploadDef<any, any, any>
	| { [key: string]: NestedDefinitionValue }

export type NestedDefinitionMap = Record<string, NestedDefinitionValue>
/* eslint-enable @typescript-eslint/no-explicit-any */

function isProcedureDef(value: unknown): value is DefinitionMap[string] {
	return typeof value === 'object' && value !== null && 'input' in value && 'handler' in value
}

function flattenDefinitions(nested: NestedDefinitionMap, prefix = ''): DefinitionMap {
	const flat: DefinitionMap = {}
	for (const [key, value] of Object.entries(nested)) {
		const fullKey = prefix ? `${prefix}.${key}` : key
		if (isProcedureDef(value)) {
			flat[fullKey] = value
		} else {
			Object.assign(flat, flattenDefinitions(value as NestedDefinitionMap, fullKey))
		}
	}
	return flat
}

export interface RouterOptions<TState = undefined> {
	pages?: Record<string, PageDef>
	rpcHashMap?: RpcHashMap
	i18n?: I18nConfig | null
	publicDir?: string
	validateOutput?: boolean
	validation?: ValidationConfig
	resolve?: ResolveStrategy[]
	channels?: ChannelResult[]
	context?: ContextConfig
	state?: TState
	transportDefaults?: Partial<Record<ProcedureKind, TransportConfig>>
}

export interface PageRequestHeaders {
	url?: string
	cookie?: string
	acceptLanguage?: string
}

export interface Router<T extends DefinitionMap> {
	manifest(): ProcedureManifest
	handle(procedureName: string, body: unknown, rawCtx?: RawContextMap): Promise<HandleResult>
	handleBatch(calls: BatchCall[], rawCtx?: RawContextMap): Promise<{ results: BatchResultItem[] }>
	handleSubscription(
		name: string,
		input: unknown,
		rawCtx?: RawContextMap,
		lastEventId?: string,
	): AsyncIterable<unknown>
	handleStream(name: string, input: unknown, rawCtx?: RawContextMap): AsyncGenerator<unknown>
	handleUpload(
		name: string,
		body: unknown,
		file: SeamFileHandle,
		rawCtx?: RawContextMap,
	): Promise<HandleResult>
	getKind(name: string): ProcedureKind | null
	handlePage(
		path: string,
		headers?: PageRequestHeaders,
		rawCtx?: RawContextMap,
	): Promise<HandlePageResult | null>
	/** Serve __data.json for a prerendered page (SPA navigation) */
	handlePageData(path: string): Promise<unknown>
	hasContext(): boolean
	readonly ctxConfig: ContextConfig
	readonly hasPages: boolean
	readonly rpcHashMap: RpcHashMap | undefined
	readonly publicDir: string | undefined
	/** Atomically replace pages, i18n, and rpcHashMap from a fresh build (dev-mode hot-reload) */
	reload(build: BuildOutput): void
	/** Exposed for adapter access to the definitions */
	readonly procedures: T
}

export function createRouter<TState = undefined, T extends DefinitionMap = DefinitionMap>(
	procedures: T | NestedDefinitionMap,
	opts?: RouterOptions<TState>,
): Router<T> {
	const flat = flattenDefinitions(procedures as NestedDefinitionMap) as T
	const state = initRouterState(flat, opts)
	const methods = buildRouterMethods(state, flat, opts)
	const router = { procedures: flat, ...methods } as Router<T>
	Object.defineProperty(router, 'hasPages', {
		get: () => state.pageMatcher.size > 0,
		enumerable: true,
		configurable: true,
	})
	Object.defineProperty(router, 'rpcHashMap', {
		get: () => state.rpcHashMap,
		enumerable: true,
		configurable: true,
	})
	Object.defineProperty(router, 'publicDir', {
		get: () => state.publicDir,
		enumerable: true,
		configurable: true,
	})
	return router
}
