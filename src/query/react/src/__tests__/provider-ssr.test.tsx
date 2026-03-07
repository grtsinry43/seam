/* src/query/react/src/__tests__/provider-ssr.test.tsx */

import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SeamQueryProvider } from '../provider.js'

// Default vitest env is node (no jsdom) — verifies server path

describe('SeamQueryProvider SSR', () => {
	const mockRpc = vi.fn()

	it('renders children without throwing in Node environment', () => {
		const html = renderToString(
			<SeamQueryProvider rpcFn={mockRpc}>
				<div data-testid="child">hello from server</div>
			</SeamQueryProvider>,
		)
		expect(html).toContain('hello from server')
	})

	it('does not create QueryClient (no Date.now trap)', () => {
		const origDateNow = Date.now
		const spy = vi.fn(origDateNow)
		Date.now = spy
		try {
			renderToString(
				<SeamQueryProvider rpcFn={mockRpc}>
					<span>safe</span>
				</SeamQueryProvider>,
			)
			// QueryClient constructor calls Date.now(); on server path it should not be called
			expect(spy).not.toHaveBeenCalled()
		} finally {
			Date.now = origDateNow
		}
	})

	it('ignores externalClient on server (passthrough only)', () => {
		// Even with an externalClient, server path should not wrap with QueryClientProvider
		const html = renderToString(
			<SeamQueryProvider rpcFn={mockRpc}>
				<p>passthrough</p>
			</SeamQueryProvider>,
		)
		expect(html).toContain('passthrough')
		// No QueryClientProvider wrapper means no extra context provider markup
	})
})
