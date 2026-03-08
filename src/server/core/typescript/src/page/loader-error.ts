/* src/server/core/typescript/src/page/loader-error.ts */

export interface LoaderError {
	__error: true
	code: string
	message: string
}

export function isLoaderError(value: unknown): value is LoaderError {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as Record<string, unknown>).__error === true &&
		typeof (value as Record<string, unknown>).code === 'string' &&
		typeof (value as Record<string, unknown>).message === 'string'
	)
}
