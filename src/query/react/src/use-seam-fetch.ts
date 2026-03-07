/* src/query/react/src/use-seam-fetch.ts */

import { useSeamQuery } from './use-seam-query.js'
import type { ProcedureMetaBase, SeamQueryConfig } from '@canmi/seam-query'

export interface UseSeamFetchResult<T = unknown> {
	data: T | undefined
	pending: boolean
	error: Error | null
}

export function useSeamFetch<
	Meta extends ProcedureMetaBase = ProcedureMetaBase,
	K extends keyof Meta & string = keyof Meta & string,
>(
	procedure: K,
	input?: Meta[K]['input'],
	options?: SeamQueryConfig,
): UseSeamFetchResult<Meta[K]['output']> {
	const result = useSeamQuery(procedure, input ?? {}, options)
	return {
		data: result.data as Meta[K]['output'] | undefined,
		pending: result.isLoading,
		error: result.error,
	}
}

export { useSeamFetch as useFetch }
