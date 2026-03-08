/* src/server/core/typescript/__tests__/context.test.ts */

import { describe, expect, it } from 'vitest'
import {
	parseExtractRule,
	contextHasExtracts,
	resolveContext,
	parseCookieHeader,
	buildRawContext,
} from '../src/context.js'
import type { ContextConfig } from '../src/context.js'
import { t } from '../src/types/index.js'
import { SeamError } from '../src/errors.js'

describe('parseExtractRule', () => {
	it('parses header rule', () => {
		expect(parseExtractRule('header:authorization')).toEqual({
			source: 'header',
			key: 'authorization',
		})
	})

	it('parses cookie rule', () => {
		expect(parseExtractRule('cookie:session_id')).toEqual({
			source: 'cookie',
			key: 'session_id',
		})
	})

	it('throws on missing colon', () => {
		expect(() => parseExtractRule('invalid')).toThrow('expected "source:key" format')
	})

	it('throws on empty source', () => {
		expect(() => parseExtractRule(':value')).toThrow('source and key must be non-empty')
	})

	it('throws on empty key', () => {
		expect(() => parseExtractRule('header:')).toThrow('source and key must be non-empty')
	})
})

describe('contextHasExtracts', () => {
	it('returns true when config has fields', () => {
		const config: ContextConfig = {
			auth: { extract: 'header:authorization', schema: t.string() },
		}
		expect(contextHasExtracts(config)).toBe(true)
	})

	it('returns false for empty config', () => {
		expect(contextHasExtracts({})).toBe(false)
	})
})

describe('parseCookieHeader', () => {
	it('parses standard cookie header', () => {
		expect(parseCookieHeader('session=abc; lang=en')).toEqual({
			session: 'abc',
			lang: 'en',
		})
	})

	it('handles spaces around values', () => {
		expect(parseCookieHeader(' session = abc ; lang = en ')).toEqual({
			session: 'abc',
			lang: 'en',
		})
	})

	it('returns empty for empty string', () => {
		expect(parseCookieHeader('')).toEqual({})
	})

	it('handles cookie with = in value', () => {
		expect(parseCookieHeader('token=abc=def')).toEqual({
			token: 'abc=def',
		})
	})
})

describe('buildRawContext', () => {
	it('extracts from header', () => {
		const config: ContextConfig = {
			auth: { extract: 'header:authorization', schema: t.string() },
		}
		const headerFn = (name: string) => (name === 'authorization' ? 'Bearer tok' : null)
		const url = new URL('http://localhost/')
		expect(buildRawContext(config, headerFn, url)).toEqual({ auth: 'Bearer tok' })
	})

	it('extracts from cookie', () => {
		const config: ContextConfig = {
			session: { extract: 'cookie:session_id', schema: t.string() },
		}
		const headerFn = (name: string) => (name === 'cookie' ? 'session_id=abc123' : null)
		const url = new URL('http://localhost/')
		expect(buildRawContext(config, headerFn, url)).toEqual({ session: 'abc123' })
	})

	it('extracts from query', () => {
		const config: ContextConfig = {
			lang: { extract: 'query:lang', schema: t.string() },
		}
		const url = new URL('http://localhost/?lang=en')
		expect(buildRawContext(config, undefined, url)).toEqual({ lang: 'en' })
	})

	it('handles mixed sources', () => {
		const config: ContextConfig = {
			auth: { extract: 'header:authorization', schema: t.string() },
			session: { extract: 'cookie:sid', schema: t.string() },
			lang: { extract: 'query:lang', schema: t.string() },
		}
		const headerFn = (name: string) => {
			if (name === 'authorization') return 'Bearer tok'
			if (name === 'cookie') return 'sid=sess123'
			return null
		}
		const url = new URL('http://localhost/?lang=en')
		expect(buildRawContext(config, headerFn, url)).toEqual({
			auth: 'Bearer tok',
			session: 'sess123',
			lang: 'en',
		})
	})

	it('returns null for missing cookie', () => {
		const config: ContextConfig = {
			session: { extract: 'cookie:session_id', schema: t.nullable(t.string()) },
		}
		const headerFn = () => null
		const url = new URL('http://localhost/')
		expect(buildRawContext(config, headerFn, url)).toEqual({ session: null })
	})

	it('returns null for missing query param', () => {
		const config: ContextConfig = {
			lang: { extract: 'query:lang', schema: t.nullable(t.string()) },
		}
		const url = new URL('http://localhost/')
		expect(buildRawContext(config, undefined, url)).toEqual({ lang: null })
	})

	it('returns null for unknown source', () => {
		const config: ContextConfig = {
			x: { extract: 'custom:key', schema: t.nullable(t.string()) },
		}
		const url = new URL('http://localhost/')
		expect(buildRawContext(config, undefined, url)).toEqual({ x: null })
	})
})

describe('resolveContext', () => {
	const config: ContextConfig = {
		auth: { extract: 'header:authorization', schema: t.string() },
		userId: { extract: 'header:x-user-id', schema: t.nullable(t.string()) },
	}

	it('resolves string value from raw context', () => {
		const result = resolveContext(config, { auth: 'Bearer tok123' }, ['auth'])
		expect(result).toEqual({ auth: 'Bearer tok123' })
	})

	it('resolves only requested keys', () => {
		const result = resolveContext(config, { auth: 'Bearer tok', userId: 'u1' }, ['auth'])
		expect(result).toEqual({ auth: 'Bearer tok' })
		expect(result).not.toHaveProperty('userId')
	})

	it('passes null for missing value with nullable schema', () => {
		const result = resolveContext(config, { auth: 'tok' }, ['userId'])
		expect(result).toEqual({ userId: null })
	})

	it('throws CONTEXT_ERROR for missing value with non-nullable schema', () => {
		try {
			resolveContext(config, {}, ['auth'])
			expect.unreachable('should have thrown')
		} catch (err) {
			expect(err).toBeInstanceOf(SeamError)
			expect((err as SeamError).code).toBe('CONTEXT_ERROR')
			expect((err as SeamError).status).toBe(400)
		}
	})

	it('throws on undefined context field', () => {
		try {
			resolveContext(config, {}, ['nonexistent'])
			expect.unreachable('should have thrown')
		} catch (err) {
			expect(err).toBeInstanceOf(SeamError)
			expect((err as SeamError).message).toContain('not defined')
		}
	})

	it('resolves JSON object from raw context', () => {
		const objConfig: ContextConfig = {
			meta: {
				extract: 'header:x-meta',
				schema: t.object({ role: t.string() }),
			},
		}
		const result = resolveContext(objConfig, { meta: '{"role":"admin"}' }, ['meta'])
		expect(result).toEqual({ meta: { role: 'admin' } })
	})

	it('throws on invalid JSON for object schema', () => {
		const objConfig: ContextConfig = {
			meta: {
				extract: 'header:x-meta',
				schema: t.object({ role: t.string() }),
			},
		}
		try {
			resolveContext(objConfig, { meta: 'not-json' }, ['meta'])
			expect.unreachable('should have thrown')
		} catch (err) {
			expect(err).toBeInstanceOf(SeamError)
			expect((err as SeamError).message).toContain('failed to parse value as JSON')
		}
	})

	it('throws on schema validation failure for parsed JSON', () => {
		const objConfig: ContextConfig = {
			meta: {
				extract: 'header:x-meta',
				schema: t.object({ role: t.string() }),
			},
		}
		try {
			resolveContext(objConfig, { meta: '{"role": 42}' }, ['meta'])
			expect.unreachable('should have thrown')
		} catch (err) {
			expect(err).toBeInstanceOf(SeamError)
			expect((err as SeamError).message).toContain('validation failed')
		}
	})

	it('returns empty object for empty requestedKeys', () => {
		const result = resolveContext(config, { auth: 'tok' }, [])
		expect(result).toEqual({})
	})
})
