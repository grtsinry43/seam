/* src/server/core/typescript/src/factory.ts */

import type { QueryDef, CommandDef, SubscriptionDef, StreamDef, UploadDef } from './router/index.js'

export function query<TIn, TOut, TState = undefined>(
	def: Omit<QueryDef<TIn, TOut, TState>, 'kind' | 'type'>,
): QueryDef<TIn, TOut, TState> {
	return { ...def, kind: 'query' } as QueryDef<TIn, TOut, TState>
}

export function command<TIn, TOut, TState = undefined>(
	def: Omit<CommandDef<TIn, TOut, TState>, 'kind' | 'type'>,
): CommandDef<TIn, TOut, TState> {
	return { ...def, kind: 'command' } as CommandDef<TIn, TOut, TState>
}

export function subscription<TIn, TOut, TState = undefined>(
	def: Omit<SubscriptionDef<TIn, TOut, TState>, 'kind' | 'type'>,
): SubscriptionDef<TIn, TOut, TState> {
	return { ...def, kind: 'subscription' } as SubscriptionDef<TIn, TOut, TState>
}

export function stream<TIn, TChunk, TState = undefined>(
	def: Omit<StreamDef<TIn, TChunk, TState>, 'kind'>,
): StreamDef<TIn, TChunk, TState> {
	return { ...def, kind: 'stream' } as StreamDef<TIn, TChunk, TState>
}

export function upload<TIn, TOut, TState = undefined>(
	def: Omit<UploadDef<TIn, TOut, TState>, 'kind'>,
): UploadDef<TIn, TOut, TState> {
	return { ...def, kind: 'upload' } as UploadDef<TIn, TOut, TState>
}
