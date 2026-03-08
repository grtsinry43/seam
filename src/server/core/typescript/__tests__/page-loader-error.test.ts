/* src/server/core/typescript/__tests__/page-loader-error.test.ts */

import { describe, expect, it } from 'vitest'
import { handlePageRequest } from '../src/page/handler.js'
import { SeamError } from '../src/errors.js'
import { isLoaderError } from '../src/page/loader-error.js'
import {
	makeProcedures,
	mockProcedure,
	simplePage,
	extractSeamData,
} from './page-handler-helpers.js'

// eslint-disable-next-line max-lines-per-function -- test suite
describe('per-loader error boundaries', () => {
	it('handler throw returns 200 with error marker, healthy loaders intact', async () => {
		const procs = makeProcedures(
			['getUser', mockProcedure(() => ({ name: 'Alice' }))],
			[
				'getOrg',
				mockProcedure(() => {
					throw new Error('db down')
				}),
			],
		)
		const page = simplePage('<h1>hi</h1>', {
			user: () => ({ procedure: 'getUser', input: {} }),
			org: () => ({ procedure: 'getOrg', input: {} }),
		})

		const result = await handlePageRequest(page, {}, procs)
		expect(result.status).toBe(200)
		const data = extractSeamData(result.html)
		expect(data.user).toEqual({ name: 'Alice' })
		expect(isLoaderError(data.org)).toBe(true)
		expect((data.org as { code: string }).code).toBe('INTERNAL_ERROR')
	})

	it('__loaders metadata has error: true on failed entry', async () => {
		const procs = makeProcedures(
			['getUser', mockProcedure(() => ({ name: 'Alice' }))],
			[
				'getOrg',
				mockProcedure(() => {
					throw new Error('fail')
				}),
			],
		)
		const page = simplePage('<p>hi</p>', {
			user: () => ({ procedure: 'getUser', input: {} }),
			org: () => ({ procedure: 'getOrg', input: {} }),
		})

		const result = await handlePageRequest(page, {}, procs)
		const data = extractSeamData(result.html)
		const loaders = data.__loaders as Record<
			string,
			{ procedure: string; input: unknown; error?: boolean }
		>
		expect(loaders.user.error).toBeUndefined()
		expect(loaders.org.error).toBe(true)
	})

	it('missing procedure caught per-loader, not page-level 500', async () => {
		const procs = makeProcedures(['getUser', mockProcedure(() => ({ name: 'Alice' }))])
		const page = simplePage('<p>hi</p>', {
			user: () => ({ procedure: 'getUser', input: {} }),
			ghost: () => ({ procedure: 'nonExistent', input: {} }),
		})

		const result = await handlePageRequest(page, {}, procs)
		expect(result.status).toBe(200)
		const data = extractSeamData(result.html)
		expect(data.user).toEqual({ name: 'Alice' })
		expect(isLoaderError(data.ghost)).toBe(true)
	})

	it('SeamError code preserved in error marker', async () => {
		const procs = makeProcedures([
			'getSecret',
			mockProcedure(() => {
				throw new SeamError('FORBIDDEN', 'no access')
			}),
		])
		const page = simplePage('<p>hi</p>', {
			secret: () => ({ procedure: 'getSecret', input: {} }),
		})

		const result = await handlePageRequest(page, {}, procs)
		const data = extractSeamData(result.html)
		expect(isLoaderError(data.secret)).toBe(true)
		expect((data.secret as { code: string }).code).toBe('FORBIDDEN')
		expect((data.secret as { message: string }).message).toBe('no access')
	})

	it('error marker bypasses projection', async () => {
		const procs = makeProcedures([
			'getUser',
			mockProcedure(() => {
				throw new Error('boom')
			}),
		])
		const page = simplePage('<p>hi</p>', {
			user: () => ({ procedure: 'getUser', input: {} }),
		})
		page.projections = { user: ['name', 'email'] }

		const result = await handlePageRequest(page, {}, procs)
		const data = extractSeamData(result.html)
		expect(isLoaderError(data.user)).toBe(true)
		expect((data.user as { message: string }).message).toBe('boom')
	})

	it('ctxResolver error caught per-loader', async () => {
		const procs = makeProcedures(['getUser', mockProcedure(() => ({ name: 'Alice' }))])
		const page = simplePage('<p>hi</p>', {
			user: () => ({ procedure: 'getUser', input: {} }),
		})

		const badCtxResolver = () => {
			throw new Error('ctx exploded')
		}

		const result = await handlePageRequest(page, {}, procs, undefined, undefined, badCtxResolver)
		expect(result.status).toBe(200)
		const data = extractSeamData(result.html)
		expect(isLoaderError(data.user)).toBe(true)
		expect((data.user as { message: string }).message).toBe('ctx exploded')
	})
})
