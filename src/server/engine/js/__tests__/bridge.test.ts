/* src/server/engine/js/__tests__/bridge.test.ts */

import { describe, expect, it } from 'vitest'
import {
	inject,
	injectNoScript,
	asciiEscapeJson,
	parseBuildOutput,
	renderPage,
	parseI18nConfig,
	parseRpcHashMap,
	i18nQuery,
} from '../src/index.js'

describe('inject', () => {
	const TEMPLATE = '<html><head></head><body><!--seam:content--></body></html>'

	it('injects data with default dataId', () => {
		const result = inject(TEMPLATE, { x: 1 })
		expect(result).toContain('id="__data"')
		expect(result).toContain('"x":1')
	})

	it('injects data with custom dataId', () => {
		const result = inject(TEMPLATE, { key: 'val' }, { dataId: '__custom' })
		expect(result).toContain('id="__custom"')
	})

	it('skips data script when skipDataScript is true', () => {
		const result = inject(TEMPLATE, { x: 1 }, { skipDataScript: true })
		expect(result).not.toContain('<script')
	})

	it('handles empty data object', () => {
		const result = inject(TEMPLATE, {})
		expect(result).toContain('id="__data"')
	})
})

describe('injectNoScript', () => {
	it('injects without script tag', () => {
		const template = '<html><head></head><body></body></html>'
		const result = injectNoScript(template, '{"a":1}')
		expect(result).not.toContain('<script')
	})
})

describe('asciiEscapeJson', () => {
	it('escapes non-ASCII characters to unicode sequences', () => {
		const result = asciiEscapeJson('{"k":"你好"}')
		expect(result).toContain('\\u')
		expect(result).not.toContain('你')
	})

	it('leaves ASCII-only JSON unchanged', () => {
		const input = '{"k":"hello"}'
		expect(asciiEscapeJson(input)).toBe(input)
	})

	it('handles empty object', () => {
		expect(asciiEscapeJson('{}')).toBe('{}')
	})
})

describe('parseBuildOutput', () => {
	it('parses minimal manifest JSON', () => {
		const manifest = JSON.stringify({
			routes: { '/': { template: '<html></html>', layouts: [] } },
			assets: {},
		})
		const result = parseBuildOutput(manifest)
		const parsed = JSON.parse(result)
		expect(parsed).toBeDefined()
	})
})

describe('renderPage', () => {
	const TEMPLATE =
		'<html><head><meta charset="utf-8"><title>Test</title></head><body><p><!--seam:title--></p></body></html>'

	it('injects data and replaces slots', () => {
		const data = JSON.stringify({ title: 'Hello' })
		const config = JSON.stringify({ layout_chain: [], data_id: '__data' })
		const result = renderPage(TEMPLATE, data, config)
		expect(result).toContain('<p>Hello</p>')
		expect(result).toContain('id="__data"')
		expect(result).toContain('"title":"Hello"')
	})

	it('returns template unchanged on invalid config', () => {
		const result = renderPage('plain html', '{}', 'invalid json')
		expect(result).toBe('plain html')
	})
})

describe('parseI18nConfig', () => {
	it('extracts locales from manifest', () => {
		const manifest = JSON.stringify({
			layouts: {},
			routes: {},
			i18n: { locales: ['en', 'zh'], default: 'en' },
		})
		const result = JSON.parse(parseI18nConfig(manifest))
		expect(result.locales).toEqual(['en', 'zh'])
		expect(result.default).toBe('en')
	})

	it('returns null without i18n section', () => {
		const manifest = JSON.stringify({ layouts: {}, routes: {} })
		expect(parseI18nConfig(manifest)).toBe('null')
	})
})

describe('parseRpcHashMap', () => {
	it('builds reverse lookup', () => {
		const input = JSON.stringify({
			salt: 'abc',
			batch: 'hash_batch',
			procedures: { getUser: 'hash_1', getStats: 'hash_2' },
		})
		const result = JSON.parse(parseRpcHashMap(input))
		expect(result.batch).toBe('hash_batch')
		expect(result.reverse_lookup).toEqual({
			hash_1: 'getUser',
			hash_2: 'getStats',
		})
	})
})

describe('i18nQuery', () => {
	it('resolves with fallback chain', () => {
		const keys = JSON.stringify(['hello', 'bye', 'missing'])
		const messages = JSON.stringify({
			en: { hello: 'Hello', bye: 'Bye' },
			zh: { hello: '你好' },
		})
		const result = JSON.parse(i18nQuery(keys, 'zh', 'en', messages))
		// Target locale hit
		expect(result.messages.hello).toBe('你好')
		// Fallback to default locale
		expect(result.messages.bye).toBe('Bye')
		// Fallback to key itself
		expect(result.messages.missing).toBe('missing')
	})
})
