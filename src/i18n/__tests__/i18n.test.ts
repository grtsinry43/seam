/* src/i18n/__tests__/i18n.test.ts */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createI18n, sortMessages, switchLocale, cleanLocaleQuery } from '../src/index.js'

describe('createI18n', () => {
	it('t() returns translation for existing key', () => {
		const i18n = createI18n('en', { greeting: 'Hello' })
		expect(i18n.t('greeting')).toBe('Hello')
		expect(i18n.locale).toBe('en')
	})

	it('t() returns key itself for missing key', () => {
		const i18n = createI18n('en', {})
		expect(i18n.t('missing.key')).toBe('missing.key')
	})

	it('t() interpolates single param', () => {
		const i18n = createI18n('en', { hello: 'Hello {name}' })
		expect(i18n.t('hello', { name: 'Alice' })).toBe('Hello Alice')
	})

	it('t() interpolates multiple params', () => {
		const i18n = createI18n('en', { info: '{name} has {count} repos' })
		expect(i18n.t('info', { name: 'Alice', count: 42 })).toBe('Alice has 42 repos')
	})

	it('t() preserves unmatched placeholders', () => {
		const i18n = createI18n('en', { msg: 'Hello {name}, {title}' })
		expect(i18n.t('msg', { name: 'Alice' })).toBe('Hello Alice, {title}')
	})

	it('t() without params returns raw message (no interpolation overhead)', () => {
		const i18n = createI18n('en', { raw: 'Has {braces} in it' })
		expect(i18n.t('raw')).toBe('Has {braces} in it')
	})
})

describe('sortMessages', () => {
	it('sorts keys alphabetically', () => {
		const sorted = sortMessages({ z: 'last', a: 'first', m: 'middle' })
		expect(Object.keys(sorted)).toEqual(['a', 'm', 'z'])
	})

	it('preserves values', () => {
		const sorted = sortMessages({ b: 'B', a: 'A' })
		expect(sorted).toEqual({ a: 'A', b: 'B' })
	})

	it('handles empty object', () => {
		expect(sortMessages({})).toEqual({})
	})
})

describe('switchLocale', () => {
	let cookieValue: string
	let reloaded: boolean

	beforeEach(() => {
		cookieValue = ''
		reloaded = false

		Object.defineProperty(globalThis, 'document', {
			value: {
				get cookie() {
					return cookieValue
				},
				set cookie(val: string) {
					cookieValue = val
				},
			},
			writable: true,
			configurable: true,
		})

		Object.defineProperty(globalThis, 'window', {
			value: {
				location: {
					reload: () => {
						reloaded = true
					},
				},
			},
			writable: true,
			configurable: true,
		})
	})

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).document
		delete (globalThis as Record<string, unknown>).window
	})

	it('reload mode: writes cookie and reloads', async () => {
		await switchLocale('zh', { writeCookie: true })
		expect(cookieValue).toContain('seam-locale=zh')
		expect(reloaded).toBe(true)
	})

	it('SPA mode: calls rpc and onMessages', async () => {
		const onMessages = vi.fn()
		const rpc = vi.fn().mockResolvedValue({ hash: 'abc', messages: { hi: '嗨' } })
		await switchLocale('zh', {
			reload: false,
			rpc,
			routeHash: 'route123',
			onMessages,
			writeCookie: false,
		})
		expect(rpc).toHaveBeenCalledWith('seam.i18n.query', { route: 'route123', locale: 'zh' })
		expect(onMessages).toHaveBeenCalledWith('zh', { hi: '嗨' }, 'abc')
	})

	it('SPA mode: no-op when rpc/routeHash/onMessages missing', async () => {
		await switchLocale('zh', { reload: false, writeCookie: false })
		expect(reloaded).toBe(false)
	})

	it('writeCookie:false skips cookie writing', async () => {
		await switchLocale('zh', { writeCookie: false })
		expect(cookieValue).toBe('')
	})

	it('writeCookie with custom options', async () => {
		await switchLocale('ja', {
			writeCookie: { name: 'lang', path: '/app', maxAge: 3600, sameSite: 'strict' },
			reload: false,
		})
		expect(cookieValue).toBe('lang=ja;path=/app;max-age=3600;samesite=strict')
	})
})

describe('cleanLocaleQuery', () => {
	let replaceStateFn: ReturnType<typeof vi.fn>

	beforeEach(() => {
		replaceStateFn = vi.fn()
		Object.defineProperty(globalThis, 'window', {
			value: {
				location: { href: 'http://localhost/page?lang=zh&foo=bar' },
				history: { state: null, replaceState: replaceStateFn },
			},
			writable: true,
			configurable: true,
		})
	})

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).window
	})

	it('removes lang param from URL', () => {
		cleanLocaleQuery()
		expect(replaceStateFn).toHaveBeenCalledWith(null, '', '/page?foo=bar')
	})

	it('no-op when param not present', () => {
		;(globalThis as Record<string, unknown>).window = {
			location: { href: 'http://localhost/page?foo=bar' },
			history: { state: null, replaceState: replaceStateFn },
		}
		cleanLocaleQuery()
		expect(replaceStateFn).not.toHaveBeenCalled()
	})

	it('uses custom param name', () => {
		;(globalThis as Record<string, unknown>).window = {
			location: { href: 'http://localhost/page?locale=zh' },
			history: { state: null, replaceState: replaceStateFn },
		}
		cleanLocaleQuery('locale')
		expect(replaceStateFn).toHaveBeenCalledWith(null, '', '/page')
	})

	it('no-op when window undefined', () => {
		delete (globalThis as Record<string, unknown>).window
		cleanLocaleQuery()
	})
})
