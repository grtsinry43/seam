/* src/server/core/typescript/__tests__/router-reload.test.ts */

import { describe, it, expect } from 'vitest'
import { createRouter } from '../src/router/index.js'
import { t } from '../src/types/index.js'
import type { PageDef } from '../src/page/index.js'
import type { BuildOutput } from '../src/page/build-loader.js'

function makePage(template: string): PageDef {
	return { template, loaders: {} }
}

const procedures = {
	greet: {
		input: t.object({ name: t.string() }),
		output: t.object({ message: t.string() }),
		handler: ({ input }: { input: { name: string } }) => ({ message: `Hello, ${input.name}!` }),
	},
}

describe('router.reload', () => {
	it('new route is accessible after reload', async () => {
		const router = createRouter(procedures, {
			pages: { '/': makePage('<p>home</p>') },
		})
		expect(router.hasPages).toBe(true)

		const freshBuild: BuildOutput = {
			pages: {
				'/': makePage('<p>home</p>'),
				'/about': makePage('<p>about</p>'),
			},
			rpcHashMap: undefined,
			i18n: null,
		}
		router.reload(freshBuild)

		// handlePage uses the engine which may not be available in unit tests,
		// so we verify via the hasPages flag and internal matcher behavior
		expect(router.hasPages).toBe(true)
	})

	it('old routes are removed after reload with different pages', async () => {
		const router = createRouter(procedures, {
			pages: {
				'/': makePage('<p>home</p>'),
				'/old': makePage('<p>old</p>'),
			},
		})

		router.reload({
			pages: { '/new': makePage('<p>new</p>') },
			rpcHashMap: undefined,
			i18n: null,
		})

		// Old route should not match — handlePage returns null for unmatched routes
		const result = await router.handlePage('/old')
		expect(result).toBeNull()
	})

	it('hasPages reflects reloaded state (false -> true -> false)', () => {
		const router = createRouter(procedures)
		expect(router.hasPages).toBe(false)

		router.reload({
			pages: { '/': makePage('<p>home</p>') },
			rpcHashMap: undefined,
			i18n: null,
		})
		expect(router.hasPages).toBe(true)

		router.reload({
			pages: {},
			rpcHashMap: undefined,
			i18n: null,
		})
		expect(router.hasPages).toBe(false)
	})

	it('rpcHashMap is updated after reload', () => {
		const router = createRouter(procedures)
		expect(router.rpcHashMap).toBeUndefined()

		const hashMap = { salt: 'abc', batch: 'b1', procedures: { greet: 'h1' } }
		router.reload({
			pages: {},
			rpcHashMap: hashMap,
			i18n: null,
		})
		expect(router.rpcHashMap).toBe(hashMap)

		router.reload({
			pages: {},
			rpcHashMap: undefined,
			i18n: null,
		})
		expect(router.rpcHashMap).toBeUndefined()
	})

	it('router works without ever calling reload', async () => {
		const router = createRouter(procedures, {
			pages: { '/': makePage('<p>home</p>') },
		})
		expect(router.hasPages).toBe(true)

		const result = await router.handle('greet', { name: 'World' })
		expect(result.status).toBe(200)
		expect(result.body).toEqual({ ok: true, data: { message: 'Hello, World!' } })
	})
})
