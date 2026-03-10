/* src/server/core/typescript/__tests__/seam-router.test.ts */

import { describe, expect, it } from 'vitest'
import { createSeamRouter } from '../src/seam-router.js'
import { t } from '../src/types/index.js'
import type { CommandDef, DefinitionMap } from '../src/router/index.js'

const authSchema = t.object({ userId: t.string(), role: t.string() })

function setup() {
	return createSeamRouter({
		context: {
			auth: {
				extract: 'header:authorization',
				schema: authSchema,
			},
		},
		state: {
			prefix: 'state',
		},
	})
}

describe('define factories stamp correct kind', () => {
	const { define } = setup()

	it('define.query stamps kind: query and preserves fields', () => {
		const def = define.query({
			input: t.object({ id: t.string() }),
			output: t.object({ name: t.string() }),
			cache: { ttl: 30 },
			handler: ({ input }) => ({ name: input.id }),
		})
		expect(def.kind).toBe('query')
		expect(def.cache).toEqual({ ttl: 30 })
	})

	it('define.command stamps kind: command and preserves invalidates', () => {
		const def = define.command({
			input: t.object({ id: t.string() }),
			output: t.object({ ok: t.boolean() }),
			invalidates: ['listItems'],
			handler: () => ({ ok: true }),
		})
		expect(def.kind).toBe('command')
		expect(def.invalidates).toEqual(['listItems'])
	})

	it('define.subscription stamps kind: subscription', () => {
		async function* gen() {
			yield { n: 1 }
		}
		const def = define.subscription({
			input: t.object({}),
			output: t.object({ n: t.int32() }),
			handler: () => gen(),
		})
		expect(def.kind).toBe('subscription')
	})

	it('define.stream stamps kind: stream', () => {
		const def = define.stream({
			input: t.object({}),
			output: t.object({ n: t.int32() }),
			async *handler() {
				yield { n: 1 }
			},
		})
		expect(def.kind).toBe('stream')
	})

	it('define.upload stamps kind: upload', () => {
		const def = define.upload({
			input: t.object({ name: t.string() }),
			output: t.object({ size: t.int32() }),
			handler: () => ({ size: 0 }),
		})
		expect(def.kind).toBe('upload')
	})
})

describe('router()', () => {
	it('creates a working Router that handles requests', async () => {
		const { router, define } = setup()

		const getItem = define.query({
			input: t.object({ id: t.string() }),
			output: t.object({ name: t.string() }),
			handler: ({ input }) => ({ name: input.id }),
		})

		const r = router({ getItem })
		const result = await r.handle('getItem', { id: 'abc' })
		expect(result.status).toBe(200)
		expect(result.body).toEqual({ ok: true, data: { name: 'abc' } })
	})

	it('passes app state to handlers', async () => {
		const { router, define } = setup()

		const getItem = define.query({
			input: t.object({ id: t.string() }),
			output: t.object({ name: t.string() }),
			handler: ({ input, state }) => ({ name: `${state.prefix}:${input.id}` }),
		})

		const r = router({ getItem })
		const result = await r.handle('getItem', { id: 'abc' })
		expect(result.status).toBe(200)
		expect(result.body).toEqual({ ok: true, data: { name: 'state:abc' } })
	})

	it('carries context config — handler receives resolved ctx', async () => {
		const { router, define } = setup()

		const getSecret = define.query({
			input: t.object({}),
			output: t.object({ uid: t.string() }),
			context: ['auth'],
			handler: ({ ctx }) => ({ uid: ctx.auth.userId }),
		})

		const r = router({ getSecret })
		const result = await r.handle(
			'getSecret',
			{},
			{ auth: JSON.stringify({ userId: 'u1', role: 'admin' }) },
		)
		expect(result.status).toBe(200)
		expect(result.body).toEqual({ ok: true, data: { uid: 'u1' } })
	})

	it('merges extraOpts into router options', () => {
		const { router, define } = setup()

		const greet = define.query({
			input: t.object({}),
			output: t.object({}),
			handler: () => ({}),
		})

		const r = router({ greet }, { validateOutput: false })
		// Just verify it creates without errors
		expect(r.manifest().procedures.greet.kind).toBe('query')
	})
})

describe('define output is structurally identical to standalone factory', () => {
	it('define.query matches factory.query structure', () => {
		const { define } = setup()
		const def = define.query({
			input: t.object({ x: t.int32() }),
			output: t.object({ y: t.int32() }),
			handler: ({ input }) => ({ y: input.x }),
		})
		expect(def).toHaveProperty('kind', 'query')
		expect(def).toHaveProperty('input')
		expect(def).toHaveProperty('output')
		expect(def).toHaveProperty('handler')
	})
})

describe('type-level checks', () => {
	it('ctx.auth.userId has type string when context: [auth]', () => {
		const { define } = setup()
		define.query({
			input: t.object({}),
			output: t.object({ uid: t.string() }),
			context: ['auth'],
			handler: ({ ctx }) => {
				const uid: string = ctx.auth.userId
				return { uid }
			},
		})
	})

	it('state.prefix has inferred type string', () => {
		const { define } = setup()
		define.query({
			input: t.object({}),
			output: t.object({ value: t.string() }),
			handler: ({ state }) => {
				const value: string = state.prefix
				return { value }
			},
		})
	})

	it('ctx.auth.nonExistent is a type error', () => {
		const { define } = setup()
		define.query({
			input: t.object({}),
			output: t.object({}),
			context: ['auth'],
			handler: ({ ctx }) => {
				// @ts-expect-error nonExistent does not exist on auth
				void ctx.auth.nonExistent
				return {}
			},
		})
	})

	it('ctx.auth is a type error when context omitted', () => {
		const { define } = setup()
		define.query({
			input: t.object({}),
			output: t.object({}),
			handler: ({ ctx }) => {
				// @ts-expect-error auth not available without context
				void ctx.auth
				return {}
			},
		})
	})

	it('context: [nonexistent] is a type error', () => {
		const { define } = setup()
		define.query({
			input: t.object({}),
			output: t.object({}),
			// @ts-expect-error nonexistent is not a valid context key
			context: ['nonexistent'],
			handler: () => ({}),
		})
	})

	it('define.query rejects invalidates', () => {
		const { define } = setup()
		define.query({
			input: t.object({}),
			output: t.object({}),
			// @ts-expect-error invalidates is not on query
			invalidates: ['foo'],
			handler: () => ({}),
		})
	})

	it('define.command return type satisfies CommandDef', () => {
		const { define } = setup()
		const def = define.command({
			input: t.object({}),
			output: t.object({ ok: t.boolean() }),
			handler: () => ({ ok: true }),
		})
		// Assignable to CommandDef — compile-time check
		const _cmd: CommandDef = def
		void _cmd
		// Assignable to DefinitionMap value
		const _map: DefinitionMap = { myCmd: def }
		void _map
	})
})
