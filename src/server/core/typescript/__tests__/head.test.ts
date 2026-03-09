/* src/server/core/typescript/__tests__/head.test.ts */

import { describe, expect, it } from 'vitest'
import { headConfigToHtml } from '../src/page/head.js'
import { handlePageRequest } from '../src/page/handler.js'
import { makeProcedures, mockProcedure, simplePage } from './page-handler-helpers.js'

describe('headConfigToHtml', () => {
	it('converts title with escaping', () => {
		expect(headConfigToHtml({ title: 'My <Blog>' })).toBe('<title>My &lt;Blog&gt;</title>')
	})

	it('converts meta tags with attribute escaping', () => {
		expect(
			headConfigToHtml({
				meta: [{ name: 'description', content: 'A "great" page' }],
			}),
		).toBe('<meta name="description" content="A &quot;great&quot; page">')
	})

	it('converts link tags', () => {
		expect(
			headConfigToHtml({
				link: [{ rel: 'canonical', href: 'https://example.com/a&b' }],
			}),
		).toBe('<link rel="canonical" href="https://example.com/a&amp;b">')
	})

	it('skips undefined values in meta', () => {
		expect(
			headConfigToHtml({
				meta: [{ name: 'description', content: 'test', property: undefined }],
			}),
		).toBe('<meta name="description" content="test">')
	})

	it('returns empty string for empty config', () => {
		expect(headConfigToHtml({})).toBe('')
	})

	it('combines title, meta, and link', () => {
		const html = headConfigToHtml({
			title: 'My Page',
			meta: [{ name: 'description', content: 'desc' }],
			link: [{ rel: 'icon', href: '/favicon.ico' }],
		})
		expect(html).toBe(
			'<title>My Page</title>' +
				'<meta name="description" content="desc">' +
				'<link rel="icon" href="/favicon.ico">',
		)
	})

	it('escapes ampersand in title', () => {
		expect(headConfigToHtml({ title: 'A & B' })).toBe('<title>A &amp; B</title>')
	})

	it('escapes single quotes in attributes', () => {
		expect(
			headConfigToHtml({
				meta: [{ name: 'description', content: "it's good" }],
			}),
		).toBe('<meta name="description" content="it&#x27;s good">')
	})
})

// Template with full document structure needed for head_meta injection
const DOC_PREFIX = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div id="__seam">'
const DOC_SUFFIX = '</div></body></html>'
function docTemplate(body: string): string {
	return `${DOC_PREFIX}${body}${DOC_SUFFIX}`
}

describe('handlePageRequest with headFn', () => {
	it('produces head HTML from loader data', async () => {
		const procs = makeProcedures([
			'getPost',
			mockProcedure(() => ({ title: 'Hello World', excerpt: 'A post' })),
		])
		const page = {
			...simplePage(docTemplate('<p><!--seam:post.title--></p>'), {
				post: () => ({ procedure: 'getPost', input: {} }),
			}),
			headFn: (data: Record<string, unknown>) => {
				const post = data.post as { title: string; excerpt: string }
				return {
					title: `${post.title} | Blog`,
					meta: [{ name: 'description', content: post.excerpt }],
				}
			},
		}

		const result = await handlePageRequest(page, {}, procs)
		expect(result.status).toBe(200)
		expect(result.html).toContain('<title>Hello World | Blog</title>')
		expect(result.html).toContain('<meta name="description" content="A post">')
	})

	it('falls back to headMeta when headFn throws', async () => {
		const procs = makeProcedures(['getPost', mockProcedure(() => ({ title: 'Hi' }))])
		const page = {
			...simplePage(docTemplate('<p><!--seam:post.title--></p>'), {
				post: () => ({ procedure: 'getPost', input: {} }),
			}),
			headMeta: '<title>Fallback</title>',
			headFn: () => {
				throw new Error('oops')
			},
		}

		const result = await handlePageRequest(page, {}, procs)
		expect(result.status).toBe(200)
		expect(result.html).toContain('<title>Fallback</title>')
	})

	it('uses headMeta from manifest when no headFn', async () => {
		const procs = makeProcedures(['getPost', mockProcedure(() => ({ title: 'Hi' }))])
		const page = {
			...simplePage(docTemplate('<p><!--seam:post.title--></p>'), {
				post: () => ({ procedure: 'getPost', input: {} }),
			}),
			headMeta: '<title><!--seam:post.title--></title>',
		}

		const result = await handlePageRequest(page, {}, procs)
		expect(result.status).toBe(200)
		// Engine resolves slot markers in headMeta
		expect(result.html).toContain('<title>Hi</title>')
	})
})
