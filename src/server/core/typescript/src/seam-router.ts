/* src/server/core/typescript/src/seam-router.ts */

import type { SchemaNode } from './types/schema.js'
import type {
	QueryDef,
	CommandDef,
	SubscriptionDef,
	StreamDef,
	UploadDef,
	DefinitionMap,
	Router,
	RouterOptions,
	InvalidateTarget,
	TransportConfig,
	CacheConfig,
} from './router/index.js'
import type { SeamFileHandle } from './procedure.js'
import { createRouter } from './router/index.js'

// -- Type-level context inference --

export interface TypedContextFieldDef<T = unknown> {
	extract: string
	schema: SchemaNode<T>
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type InferContextMap<T extends Record<string, TypedContextFieldDef<any>>> = {
	[K in keyof T]: T[K] extends TypedContextFieldDef<infer U> ? U : never
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type PickContext<TMap, TKeys extends readonly string[]> = Pick<TMap, TKeys[number] & keyof TMap>

// -- Per-kind def types with typed ctx --

type QueryDefWithCtx<TIn, TOut, TCtx, TState> = {
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: readonly string[]
	transport?: TransportConfig
	suppress?: string[]
	cache?: CacheConfig
	handler: (params: { input: TIn; ctx: TCtx; state: TState }) => TOut | Promise<TOut>
}

type CommandDefWithCtx<TIn, TOut, TCtx, TState> = {
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: readonly string[]
	invalidates?: InvalidateTarget[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: { input: TIn; ctx: TCtx; state: TState }) => TOut | Promise<TOut>
}

type SubscriptionDefWithCtx<TIn, TOut, TCtx, TState> = {
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: readonly string[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: { input: TIn; ctx: TCtx; state: TState }) => AsyncIterable<TOut>
}

type StreamDefWithCtx<TIn, TChunk, TCtx, TState> = {
	input: SchemaNode<TIn>
	output: SchemaNode<TChunk>
	error?: SchemaNode
	context?: readonly string[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: { input: TIn; ctx: TCtx; state: TState }) => AsyncGenerator<TChunk>
}

type UploadDefWithCtx<TIn, TOut, TCtx, TState> = {
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: readonly string[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: {
		input: TIn
		file: SeamFileHandle
		ctx: TCtx
		state: TState
	}) => TOut | Promise<TOut>
}

// -- SeamDefine interface --

export interface SeamDefine<TCtxMap extends Record<string, unknown>, TState> {
	query<TIn, TOut, const TKeys extends readonly (keyof TCtxMap & string)[] = []>(
		def: QueryDefWithCtx<TIn, TOut, PickContext<TCtxMap, TKeys>, TState> & { context?: TKeys },
	): QueryDef<TIn, TOut, TState>

	command<TIn, TOut, const TKeys extends readonly (keyof TCtxMap & string)[] = []>(
		def: CommandDefWithCtx<TIn, TOut, PickContext<TCtxMap, TKeys>, TState> & { context?: TKeys },
	): CommandDef<TIn, TOut, TState>

	subscription<TIn, TOut, const TKeys extends readonly (keyof TCtxMap & string)[] = []>(
		def: SubscriptionDefWithCtx<TIn, TOut, PickContext<TCtxMap, TKeys>, TState> & {
			context?: TKeys
		},
	): SubscriptionDef<TIn, TOut, TState>

	stream<TIn, TChunk, const TKeys extends readonly (keyof TCtxMap & string)[] = []>(
		def: StreamDefWithCtx<TIn, TChunk, PickContext<TCtxMap, TKeys>, TState> & {
			context?: TKeys
		},
	): StreamDef<TIn, TChunk, TState>

	upload<TIn, TOut, const TKeys extends readonly (keyof TCtxMap & string)[] = []>(
		def: UploadDefWithCtx<TIn, TOut, PickContext<TCtxMap, TKeys>, TState> & { context?: TKeys },
	): UploadDef<TIn, TOut, TState>
}

// -- createSeamRouter --

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
export function createSeamRouter<
	const T extends Record<string, TypedContextFieldDef<any>>,
	TState = undefined,
>(
	config: { context: T; state?: TState } & Omit<RouterOptions<TState>, 'context' | 'state'>,
): {
	router: <P extends DefinitionMap>(
		procedures: P,
		extraOpts?: Omit<RouterOptions<TState>, 'context' | 'state'>,
	) => Router<P>
	define: SeamDefine<InferContextMap<T>, TState>
} {
	const { context, state, ...restConfig } = config

	const define: SeamDefine<InferContextMap<T>, TState> = {
		query(def) {
			return { ...def, kind: 'query' } as any
		},
		command(def) {
			return { ...def, kind: 'command' } as any
		},
		subscription(def) {
			return { ...def, kind: 'subscription' } as any
		},
		stream(def) {
			return { ...def, kind: 'stream' } as any
		},
		upload(def) {
			return { ...def, kind: 'upload' } as any
		},
	}

	function router<P extends DefinitionMap>(
		procedures: P,
		extraOpts?: Omit<RouterOptions<TState>, 'context' | 'state'>,
	): Router<P> {
		return createRouter(procedures, { ...restConfig, context, state, ...extraOpts })
	}

	return { router, define }
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
