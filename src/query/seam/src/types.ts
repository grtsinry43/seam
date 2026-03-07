/* src/query/seam/src/types.ts */

/** Subset of seamProcedureConfig entry that seam-query reads at runtime. */
export interface ProcedureConfigEntry {
	kind: string
	cache?: false | { ttl: number }
	invalidates?: ReadonlyArray<{
		query: string
		mapping?: Record<string, { from: string; each?: boolean }>
	}>
}

/** Map of procedure name to config entry (shape of seamProcedureConfig). */
export type ProcedureConfigMap = Record<string, ProcedureConfigEntry>

export interface SeamQueryConfig {
	/** Override staleTime (ms). When absent, reads from seamProcedureConfig.cache. */
	staleTime?: number
	/** Override gcTime (ms). */
	gcTime?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProcedureMetaBase = Record<string, { kind: string; input: any; output: any }>

/** RPC function signature compatible with seamRpc. */
export type RpcFn = (procedure: string, input?: unknown) => Promise<unknown>
