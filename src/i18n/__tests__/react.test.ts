/* src/i18n/__tests__/react.test.ts */

import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { I18nProvider, useT, useLocale, useSwitchLocale } from '../src/react.js'
import { createI18n } from '../src/index.js'

function TCapture() {
	const t = useT()
	return createElement('pre', null, t('greeting'))
}

function TInterpolation() {
	const t = useT()
	return createElement('pre', null, t('hello', { name: 'Bob' }))
}

function LocaleCapture() {
	const locale = useLocale()
	return createElement('pre', null, locale)
}

function SwitchLocaleType() {
	const switchFn = useSwitchLocale()
	return createElement('pre', null, typeof switchFn)
}

describe('useT', () => {
	it('returns context t() with I18nProvider', () => {
		const i18n = createI18n('zh', { greeting: '你好' })
		const html = renderToString(
			createElement(I18nProvider, { value: i18n }, createElement(TCapture)),
		)
		expect(html).toContain('你好')
	})

	it('returns identity function without provider', () => {
		const html = renderToString(createElement(TCapture))
		expect(html).toContain('greeting')
	})

	it('supports interpolation through context', () => {
		const i18n = createI18n('en', { hello: 'Hello {name}' })
		const html = renderToString(
			createElement(I18nProvider, { value: i18n }, createElement(TInterpolation)),
		)
		expect(html).toContain('Hello Bob')
	})
})

describe('useLocale', () => {
	it('returns locale from provider', () => {
		const i18n = createI18n('zh', {})
		const html = renderToString(
			createElement(I18nProvider, { value: i18n }, createElement(LocaleCapture)),
		)
		expect(html).toContain('zh')
	})

	it('returns "en" default without provider', () => {
		const html = renderToString(createElement(LocaleCapture))
		expect(html).toContain('en')
	})
})

describe('useSwitchLocale', () => {
	it('returns a function', () => {
		const html = renderToString(createElement(SwitchLocaleType))
		expect(html).toContain('function')
	})
})
