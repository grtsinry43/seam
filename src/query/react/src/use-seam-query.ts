/* src/query/react/src/use-seam-query.ts */

import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import {
	createSeamQueryOptions,
	type ProcedureMetaBase,
	type SeamQueryConfig,
} from '@canmi/seam-query'
import { useSeamQueryContext } from './provider.js'

export function useSeamQuery<
	Meta extends ProcedureMetaBase = ProcedureMetaBase,
	K extends keyof Meta & string = keyof Meta & string,
>(
	procedureName: K,
	input: Meta[K]['input'],
	options?: Partial<UseQueryOptions<Meta[K]['output']>> & SeamQueryConfig,
): UseQueryResult<Meta[K]['output']> {
	const { rpcFn, config } = useSeamQueryContext()
	const procConfig = config?.[procedureName]
	const queryOptions = createSeamQueryOptions(rpcFn, procedureName, input, procConfig, options)
	return useQuery({ ...queryOptions, ...options } as UseQueryOptions) as UseQueryResult<
		Meta[K]['output']
	>
}
