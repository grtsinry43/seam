/* src/query/react/src/use-seam-mutation.ts */

import {
	useMutation,
	useQueryClient,
	type UseMutationOptions,
	type UseMutationResult,
} from '@tanstack/react-query'
import {
	createSeamMutationOptions,
	invalidateFromConfig,
	type ProcedureMetaBase,
} from '@canmi/seam-query'
import { useSeamQueryContext } from './provider.js'

export function useSeamMutation<
	Meta extends ProcedureMetaBase = ProcedureMetaBase,
	K extends keyof Meta & string = keyof Meta & string,
>(
	procedureName: K,
	options?: Partial<UseMutationOptions<Meta[K]['output'], Error, Meta[K]['input']>>,
): UseMutationResult<Meta[K]['output'], Error, Meta[K]['input']> {
	const { rpcFn, config } = useSeamQueryContext()
	const queryClient = useQueryClient()
	const procConfig = config?.[procedureName]
	const coreOptions = createSeamMutationOptions(rpcFn, procedureName, queryClient, procConfig)

	const mergedOnSuccess = options?.onSuccess
		? (data: unknown, variables: unknown, onMutateResult: unknown, ctx: unknown) => {
				invalidateFromConfig(queryClient, procConfig, variables)
				;(options.onSuccess as (d: unknown, v: unknown, o: unknown, c: unknown) => void)(
					data,
					variables,
					onMutateResult,
					ctx,
				)
			}
		: coreOptions.onSuccess

	return useMutation({
		...coreOptions,
		...options,
		onSuccess: mergedOnSuccess,
	} as UseMutationOptions) as UseMutationResult<Meta[K]['output'], Error, Meta[K]['input']>
}
