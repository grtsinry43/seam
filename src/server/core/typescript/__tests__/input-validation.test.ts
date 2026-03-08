/* src/server/core/typescript/__tests__/input-validation.test.ts */

import { describe, expect, it, vi } from 'vitest'
import { handleRequest, handleBatchRequest } from '../src/router/handler.js'
import type { InternalProcedure } from '../src/router/handler.js'
import { createRouter, t } from '../src/index.js'
import { greetInputSchema, greetOutputSchema } from './fixtures.js'

function makeProcedures(...entries: [string, InternalProcedure][]) {
	return new Map(entries)
}

function greetProc(handler?: InternalProcedure['handler']) {
	return makeProcedures([
		'greet',
		{
			inputSchema: greetInputSchema._schema,
			outputSchema: greetOutputSchema._schema,
			contextKeys: [],
			handler:
				handler ?? (({ input }) => ({ message: `Hi, ${(input as { name: string }).name}!` })),
		},
	])
}

describe('input validation: shouldValidateInput=true', () => {
	it('rejects invalid input with 400 + VALIDATION_ERROR + details', async () => {
		const procs = greetProc()
		const result = await handleRequest(procs, 'greet', { name: 123 }, true)
		expect(result.status).toBe(400)
		const body = result.body as {
			ok: false
			error: { code: string; message: string; details?: unknown[] }
		}
		expect(body.error.code).toBe('VALIDATION_ERROR')
		expect(body.error.message).toContain("procedure 'greet'")
		expect(body.error.details).toBeDefined()
		expect(Array.isArray(body.error.details)).toBe(true)
		const detail = (
			body.error.details as { path: string; expected?: string; actual?: string }[]
		)[0]!
		expect(detail.path).toBeDefined()
		expect(detail.expected).toBe('string')
		expect(detail.actual).toBe('number')
	})

	it('does not call handler when input is invalid', async () => {
		const handler = vi.fn(() => ({ message: 'unreachable' }))
		const procs = greetProc(handler)
		await handleRequest(procs, 'greet', { name: 123 }, true)
		expect(handler).not.toHaveBeenCalled()
	})

	it('passes valid input through to handler', async () => {
		const procs = greetProc()
		const result = await handleRequest(procs, 'greet', { name: 'Alice' }, true)
		expect(result.status).toBe(200)
		expect(result.body).toEqual({ ok: true, data: { message: 'Hi, Alice!' } })
	})
})

describe('input validation: shouldValidateInput=false', () => {
	it('calls handler even with invalid input', async () => {
		const handler = vi.fn(({ input }) => ({
			message: `Hi, ${String((input as { name: unknown }).name)}!`,
		}))
		const procs = greetProc(handler)
		const result = await handleRequest(procs, 'greet', { name: 123 }, false)
		expect(result.status).toBe(200)
		expect(handler).toHaveBeenCalled()
	})
})

describe('input validation: default behavior', () => {
	it('validates when shouldValidateInput is omitted (defaults to true)', async () => {
		const procs = greetProc()
		const result = await handleRequest(procs, 'greet', { name: 123 })
		expect(result.status).toBe(400)
	})
})

describe('router validation config', () => {
	it('validation: { input: "always" } validates even in production', async () => {
		const origEnv = process.env.NODE_ENV
		process.env.NODE_ENV = 'production'
		try {
			const router = createRouter(
				{
					greet: {
						input: t.object({ name: t.string() }),
						output: t.object({ message: t.string() }),
						handler: ({ input }) => ({ message: `Hi, ${input.name}!` }),
					},
				},
				{ validation: { input: 'always' } },
			)
			const result = await router.handle('greet', { name: 123 })
			expect(result.status).toBe(400)
			const body = result.body as { ok: false; error: { code: string } }
			expect(body.error.code).toBe('VALIDATION_ERROR')
		} finally {
			process.env.NODE_ENV = origEnv
		}
	})

	it('validation: { input: "never" } skips even in dev', async () => {
		const origEnv = process.env.NODE_ENV
		process.env.NODE_ENV = 'development'
		try {
			const router = createRouter(
				{
					greet: {
						input: t.object({ name: t.string() }),
						output: t.object({ message: t.string() }),
						handler: ({ input }) => ({
							message: `Hi, ${String((input as unknown as { name: unknown }).name)}!`,
						}),
					},
				},
				{ validation: { input: 'never' }, validateOutput: false },
			)
			const result = await router.handle('greet', { name: 123 })
			expect(result.status).toBe(200)
		} finally {
			process.env.NODE_ENV = origEnv
		}
	})

	it('validation: { input: "dev" } (default) validates when not production', async () => {
		const origEnv = process.env.NODE_ENV
		process.env.NODE_ENV = 'development'
		try {
			const router = createRouter(
				{
					greet: {
						input: t.object({ name: t.string() }),
						output: t.object({ message: t.string() }),
						handler: ({ input }) => ({ message: `Hi, ${input.name}!` }),
					},
				},
				{ validateOutput: false },
			)
			const result = await router.handle('greet', { name: 123 })
			expect(result.status).toBe(400)
		} finally {
			process.env.NODE_ENV = origEnv
		}
	})

	it('validation: { input: "dev" } skips in production', async () => {
		const origEnv = process.env.NODE_ENV
		process.env.NODE_ENV = 'production'
		try {
			const router = createRouter(
				{
					greet: {
						input: t.object({ name: t.string() }),
						output: t.object({ message: t.string() }),
						handler: ({ input }) => ({
							message: `Hi, ${String((input as unknown as { name: unknown }).name)}!`,
						}),
					},
				},
				{ validateOutput: false },
			)
			const result = await router.handle('greet', { name: 123 })
			expect(result.status).toBe(200)
		} finally {
			process.env.NODE_ENV = origEnv
		}
	})
})

describe('error details format', () => {
	it('details array has path, expected, and actual fields', async () => {
		const procs = greetProc()
		const result = await handleRequest(procs, 'greet', { name: 42 }, true)
		const body = result.body as {
			ok: false
			error: { details: { path: string; expected?: string; actual?: string }[] }
		}
		const detail = body.error.details[0]!
		expect(typeof detail.path).toBe('string')
		expect(detail.expected).toBe('string')
		expect(detail.actual).toBe('number')
	})

	it('handles missing required property', async () => {
		const procs = greetProc()
		const result = await handleRequest(procs, 'greet', {}, true)
		expect(result.status).toBe(400)
		const body = result.body as {
			ok: false
			error: { details: { path: string }[] }
		}
		expect(body.error.details.length).toBeGreaterThan(0)
	})
})

describe('batch: input validation', () => {
	it('invalid input in one call does not affect others', async () => {
		const procs = greetProc()
		const { results } = await handleBatchRequest(
			procs,
			[
				{ procedure: 'greet', input: { name: 'Alice' } },
				{ procedure: 'greet', input: { name: 123 } },
			],
			true,
		)
		expect(results).toHaveLength(2)
		expect(results[0]).toEqual({ ok: true, data: { message: 'Hi, Alice!' } })
		expect(results[1]?.ok).toBe(false)
		if (!results[1]?.ok) {
			expect(results[1]?.error.code).toBe('VALIDATION_ERROR')
		}
	})
})
