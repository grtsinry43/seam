/* src/server/core/typescript/src/errors.ts */

export type ErrorCode =
	| 'VALIDATION_ERROR'
	| 'NOT_FOUND'
	| 'UNAUTHORIZED'
	| 'FORBIDDEN'
	| 'RATE_LIMITED'
	| 'INTERNAL_ERROR'
	| (string & {})

export const DEFAULT_STATUS: Record<string, number> = {
	VALIDATION_ERROR: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	RATE_LIMITED: 429,
	INTERNAL_ERROR: 500,
}

export class SeamError extends Error {
	readonly code: string
	readonly status: number
	readonly details?: unknown[]

	constructor(code: string, message: string, status?: number, details?: unknown[]) {
		super(message)
		this.code = code
		this.status = status ?? DEFAULT_STATUS[code] ?? 500
		this.details = details
		this.name = 'SeamError'
	}

	toJSON() {
		const error: Record<string, unknown> = {
			code: this.code,
			message: this.message,
			transient: false,
		}
		if (this.details) error.details = this.details
		return { ok: false, error }
	}
}
