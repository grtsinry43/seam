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

type QueryDefWithCtx<TIn, TOut, TCtx> = {
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: readonly string[]
	transport?: TransportConfig
	suppress?: string[]
	cache?: CacheConfig
	handler: (params: { input: TIn; ctx: TCtx }) => TOut | Promise<TOut>
}

type CommandDefWithCtx<TIn, TOut, TCtx> = {
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: readonly string[]
	invalidates?: InvalidateTarget[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: { input: TIn; ctx: TCtx }) => TOut | Promise<TOut>
}

type SubscriptionDefWithCtx<TIn, TOut, TCtx> = {
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: readonly string[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: { input: TIn; ctx: TCtx }) => AsyncIterable<TOut>
}

type StreamDefWithCtx<TIn, TChunk, TCtx> = {
	input: SchemaNode<TIn>
	output: SchemaNode<TChunk>
	error?: SchemaNode
	context?: readonly string[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: { input: TIn; ctx: TCtx }) => AsyncGenerator<TChunk>
}

type UploadDefWithCtx<TIn, TOut, TCtx> = {
	input: SchemaNode<TIn>
	output: SchemaNode<TOut>
	error?: SchemaNode
	context?: readonly string[]
	transport?: TransportConfig
	suppress?: string[]
	handler: (params: { input: TIn; file: SeamFileHandle; ctx: TCtx }) => TOut | Promise<TOut>
}

// -- SeamDefine interface --

export interface SeamDefine<TCtxMap extends Record<string, unknown>> {
	query<TIn, TOut, const TKeys extends readonly (keyof TCtxMap & string)[] = []>(
		def: QueryDefWithCtx<TIn, TOut, PickContext<TCtxMap, TKeys>> & { context?: TKeys },
	): QueryDef<TIn, TOut>

	command<TIn, TOut, const TKeys extends readonly (keyof TCtxMap & string)[] = []>(
		def: CommandDefWithCtx<TIn, TOut, PickContext<TCtxMap, TKeys>> & { context?: TKeys },
	): CommandDef<TIn, TOut>

	subscription<TIn, TOut, const TKeys extends readonly (keyof TCtxMap & string)[] = []>(
		def: SubscriptionDefWithCtx<TIn, TOut, PickContext<TCtxMap, TKeys>> & { context?: TKeys },
	): SubscriptionDef<TIn, TOut>

	stream<TIn, TChunk, const TKeys extends readonly (keyof TCtxMap & string)[] = []>(
		def: StreamDefWithCtx<TIn, TChunk, PickContext<TCtxMap, TKeys>> & { context?: TKeys },
	): StreamDef<TIn, TChunk>

	upload<TIn, TOut, const TKeys extends readonly (keyof TCtxMap & string)[] = []>(
		def: UploadDefWithCtx<TIn, TOut, PickContext<TCtxMap, TKeys>> & { context?: TKeys },
	): UploadDef<TIn, TOut>
}

// -- createSeamRouter --

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
export function createSeamRouter<const T extends Record<string, TypedContextFieldDef<any>>>(
	config: { context: T } & Omit<RouterOptions, 'context'>,
): {
	router: <P extends DefinitionMap>(
		procedures: P,
		extraOpts?: Omit<RouterOptions, 'context'>,
	) => Router<P>
	define: SeamDefine<InferContextMap<T>>
} {
	const { context, ...restConfig } = config

	const define: SeamDefine<InferContextMap<T>> = {
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
		extraOpts?: Omit<RouterOptions, 'context'>,
	): Router<P> {
		return createRouter(procedures, { ...restConfig, context, ...extraOpts })
	}

	return { router, define }
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
